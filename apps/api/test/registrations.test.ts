import type { PrismaClient } from '@mxpro/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, actingAs, createUser, integrationApp, resetDb, testDb } from './db-helpers.ts';
import { MP_ENV, connectSellerAccount, fakeOAuth, fakeOrders } from './mp-fakes.ts';

/** Inscrição pelo link público do evento (ADR 0004), com o Mercado Pago simulado. */

let db: PrismaClient;
let app: Awaited<ReturnType<typeof integrationApp>>;
let mp: ReturnType<typeof fakeOrders>;
let now: Date;

beforeAll(() => {
  db = testDb();
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await app?.close();
  await resetDb(db);
  now = new Date('2027-02-01T12:00:00Z');
  mp = fakeOrders();
  app = await integrationApp(db, MP_ENV, { mercadoPagoOAuth: fakeOAuth(), mercadoPagoOrders: mp.api, now: () => now });
  await connectSellerAccount(db);
});

const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

/** Evento publicado, inscrições abertas, com MX2 (R$ 150, vagas opcionais) e Feminino (gratuita). */
async function setup({ maxEntries = null as number | null } = {}) {
  const as = await actingAs(app, db, 'ORGANIZER');
  const event = (
    await as('POST', '/api/events', { name: 'Copa Verão - Etapa 2', startDate: '2027-03-13', endDate: '2027-03-13', venue: 'Pista Terra Vermelha', city: 'Campo Largo', state: 'PR' })
  ).json();
  const mx2Cat = (await as('POST', '/api/categories', { name: 'MX2' })).json();
  const femCat = (await as('POST', '/api/categories', { name: 'Feminino' })).json();
  const mx2 = (await as('POST', `/api/events/${event.id}/categories`, { categoryId: mx2Cat.id, modality: 'MOTOCROSS', entryFeeCents: 15000, maxEntries })).json();
  const fem = (await as('POST', `/api/events/${event.id}/categories`, { categoryId: femCat.id, modality: 'MOTOCROSS', entryFeeCents: 0 })).json();
  await db.event.update({
    where: { id: event.id },
    data: { status: 'PUBLISHED', registrationOpensAt: new Date('2027-01-15T12:00:00Z'), registrationClosesAt: new Date('2027-03-11T02:59:00Z') },
  });
  return { event, mx2, fem, url: `/api/public/events/${event.id}/registrations` };
}

const account = (email = 'rafael@mxpro.test') => ({ name: 'Rafael Menezes', email, password: 'senha-forte-1', acceptPrivacy: true });
const form = (eventCategoryId: string, patch: Record<string, unknown> = {}) => ({
  eventCategoryId,
  raceNumber: '27',
  bike: 'Honda CRF 250F',
  team: 'Equipe Exemplo',
  acceptWaiver: true,
  account: account(),
  ...patch,
});
const post = (url: string, payload: object, cookie?: string) =>
  app.inject({ method: 'POST', url, payload, headers: { 'user-agent': 'Celular de teste' }, ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}) });
const cookieOf = (res: { cookies: { name: string; value: string }[] }) => res.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
const get = (url: string, cookie: string) => app.inject({ method: 'GET', url, cookies: { [SESSION_COOKIE]: cookie } });

describe('página pública do evento', () => {
  it('evento publicado: categorias, valores e vagas restantes (reservas ativas contam; vencidas não); sem dados pessoais', async () => {
    const { event, mx2, url } = await setup({ maxEntries: 3 });
    await post(url, form(mx2.id));
    const other = await createUser(db, { email: 'velho@mxpro.test', role: 'PILOT' });
    await db.registration.create({
      data: { eventId: event.id, eventCategoryId: mx2.id, pilotId: other.id, raceNumber: '99', bike: 'KTM', entryFeeCents: 15000, holdExpiresAt: minutes(-1) },
    });
    const res = await app.inject({ method: 'GET', url: `/api/public/events/${event.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ name: 'Copa Verão - Etapa 2', startDate: '2027-03-13', registration: { isOpen: true } });
    expect(body.categories.map((c: { name: string; spotsLeft: number | null }) => [c.name, c.spotsLeft])).toEqual([
      ['Feminino', null],
      ['MX2', 2],
    ]);
    expect(JSON.stringify(body)).not.toMatch(/rafael|Menezes|velho@/i);
  });

  it('rascunho ou id inválido: 404', async () => {
    const { event } = await setup();
    await db.event.update({ where: { id: event.id }, data: { status: 'DRAFT' } });
    expect((await app.inject({ method: 'GET', url: `/api/public/events/${event.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/public/events/xyz' })).statusCode).toBe(404);
  });
});

describe('primeira inscrição (cria a conta)', () => {
  it('cria conta de piloto, já entra, guarda os aceites e gera o Pix com a vaga reservada por 30 min', async () => {
    const { mx2, url } = await setup();
    const res = await post(url, form(mx2.id));
    expect(res.statusCode).toBe(201);
    const { registration, pixError } = res.json();
    expect(pixError).toBeNull();
    expect(registration).toMatchObject({
      status: 'PENDING_PAYMENT',
      raceNumber: '27',
      team: 'Equipe Exemplo',
      entryFeeCents: 15000,
      category: { name: 'MX2' },
      holdExpiresAt: minutes(30).toISOString(),
      pix: { status: 'PENDING', amountCents: 15000 },
    });
    expect(registration.pix.pixCopyPaste).toMatch(/^00020101PIX/);

    const user = await db.user.findUniqueOrThrow({ where: { email: 'rafael@mxpro.test' } });
    expect(user).toMatchObject({ name: 'Rafael Menezes', role: 'PILOT' });
    expect(user.passwordHash).not.toContain('senha-forte-1');
    const consents = await db.consent.findMany({ where: { userId: user.id }, orderBy: { kind: 'asc' } });
    expect(consents.map((c) => [c.kind, c.registrationId === registration.id, c.documentVersion, c.userAgent])).toEqual([
      ['PRIVACY_POLICY', false, '2026-11', 'Celular de teste'],
      ['LIABILITY_WAIVER', true, '2026-11', 'Celular de teste'],
    ]);

    // Já está logado: a sessão vale e a inscrição aparece em "minhas inscrições".
    const cookie = cookieOf(res)!;
    expect((await get('/api/auth/me', cookie)).json().user.email).toBe('rafael@mxpro.test');
    expect((await get('/api/me/registrations', cookie)).json().registrations).toHaveLength(1);
  });

  it('e-mail que já tem conta: pede para entrar; nada é criado', async () => {
    const { mx2, url } = await setup();
    await createUser(db, { email: 'rafael@mxpro.test', role: 'PILOT' });
    const res = await post(url, form(mx2.id));
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual([{ field: 'account.email', message: 'Já existe uma conta com este e-mail. Entre com ela para se inscrever.' }]);
    expect(await db.registration.count()).toBe(0);
  });

  it('validação por campo: termo, número, nome completo, senha, conta', async () => {
    const { mx2, url } = await setup();
    const fields = async (payload: object) => (await post(url, payload)).json().details.map((d: { field: string }) => d.field);
    expect(await fields(form(mx2.id, { acceptWaiver: false }))).toEqual(['acceptWaiver']);
    expect(await fields(form(mx2.id, { raceNumber: '1000' }))).toEqual(['raceNumber']);
    expect(await fields(form(mx2.id, { account: { ...account(), name: 'Rafael', password: '123' } }))).toEqual(['account.name', 'account.password']);
    expect(await fields(form(mx2.id, { account: { ...account(), acceptPrivacy: false } }))).toEqual(['account.acceptPrivacy']);
    expect(await fields(form(mx2.id, { account: undefined }))).toEqual(['account']);
    expect(await db.user.count({ where: { role: 'PILOT' } })).toBe(0);
  });
});

describe('regras da vaga e do número', () => {
  it('número em uso na categoria: recusa no campo e NEM a conta é criada (tudo ou nada)', async () => {
    const { mx2, url } = await setup();
    await post(url, form(mx2.id));
    const res = await post(url, form(mx2.id, { account: account('outro@mxpro.test') }));
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual([{ field: 'raceNumber', message: 'O número 27 já está em uso nesta categoria. Escolha outro.' }]);
    expect(await db.user.count({ where: { email: 'outro@mxpro.test' } })).toBe(0);
  });

  it('número de uma reserva VENCIDA fica livre de novo', async () => {
    const { mx2, url } = await setup();
    await post(url, form(mx2.id));
    now = minutes(31);
    const res = await post(url, form(mx2.id, { account: account('outro@mxpro.test') }));
    expect(res.statusCode).toBe(201);
    expect(await db.registration.findMany({ select: { status: true }, orderBy: { createdAt: 'asc' } })).toEqual([{ status: 'EXPIRED' }, { status: 'PENDING_PAYMENT' }]);
  });

  it('categoria lotada: 409; a última vaga disputada ao mesmo tempo vai para UMA pessoa só', async () => {
    const { mx2, url } = await setup({ maxEntries: 1 });
    const results = await Promise.all(
      ['a', 'b', 'c'].map((p, i) => post(url, form(mx2.id, { raceNumber: String(10 + i), account: account(`${p}@mxpro.test`) }))),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().code).toBe('CATEGORY_FULL');
    expect(await db.registration.count()).toBe(1);
  });

  it('piloto logado: inscreve-se em outra categoria sem criar conta; a mesma categoria de novo, não', async () => {
    const { mx2, fem, url } = await setup();
    const cookie = cookieOf(await post(url, form(mx2.id)))!;
    const second = await post(url, form(fem.id, { account: undefined, raceNumber: '27' }), cookie);
    expect(second.statusCode).toBe(201);
    expect(second.json().registration.status).toBe('CONFIRMED'); // gratuita: confirma na hora, sem Pix
    const again = await post(url, form(mx2.id, { account: undefined, raceNumber: '28' }), cookie);
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('ALREADY_REGISTERED');
    expect(mp.api.createPixOrder).toHaveBeenCalledTimes(1);
  });

  it('inscrições fechadas: 409', async () => {
    const { event, mx2, url } = await setup();
    await db.event.update({ where: { id: event.id }, data: { registrationClosedEarly: true } });
    const res = await post(url, form(mx2.id));
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('REGISTRATION_CLOSED');
  });

  it('equipe logada não se inscreve (precisa da conta de piloto)', async () => {
    const { mx2, url } = await setup();
    const login = await actingAs(app, db, 'SECRETARY');
    const res = await login('POST', url, form(mx2.id, { account: undefined }));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('STAFF_CANNOT_REGISTER');
  });
});

describe('pagamento', () => {
  it('Mercado Pago fora do ar: inscrição fica reservada com o motivo; o piloto gera o Pix depois', async () => {
    const { mx2, url } = await setup();
    mp.api.createPixOrder.mockRejectedValueOnce(new Error('timeout'));
    const res = await post(url, form(mx2.id));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ registration: { status: 'PENDING_PAYMENT', pix: null }, pixError: expect.stringContaining('Mercado Pago') });
    const cookie = cookieOf(res)!;
    const retry = await app.inject({ method: 'POST', url: `/api/registrations/${res.json().registration.id}/pix`, cookies: { [SESSION_COOKIE]: cookie } });
    expect(retry.json()).toMatchObject({ registration: { pix: { status: 'PENDING' } }, pixError: null });
  });

  it('tela de espera: consulta o Mercado Pago e mostra "confirmada" quando o Pix é pago', async () => {
    const { mx2, url } = await setup();
    const res = await post(url, form(mx2.id));
    const cookie = cookieOf(res)!;
    const id = res.json().registration.id as string;
    mp.set(mp.last(), 'processed', 'accredited');
    now = new Date(now.getTime() + 11_000);
    const after = await get(`/api/registrations/${id}`, cookie);
    expect(after.json()).toMatchObject({ status: 'CONFIRMED', pix: null });
  });

  it('reserva venceu sem pagar: "gerar novo Pix" reserva de novo (se o número ainda estiver livre)', async () => {
    const { mx2, url } = await setup();
    const res = await post(url, form(mx2.id));
    const cookie = cookieOf(res)!;
    const id = res.json().registration.id as string;
    now = minutes(40);
    expect((await get(`/api/registrations/${id}`, cookie)).json()).toMatchObject({ status: 'EXPIRED', pix: null });
    const renewed = await app.inject({ method: 'POST', url: `/api/registrations/${id}/pix`, cookies: { [SESSION_COOKIE]: cookie } });
    expect(renewed.json().registration).toMatchObject({ status: 'PENDING_PAYMENT', holdExpiresAt: minutes(30).toISOString(), pix: { status: 'PENDING' } });
    expect(mp.api.createPixOrder).toHaveBeenCalledTimes(2);
  });

  it('número pego por outro enquanto a reserva estava vencida: novo Pix recusado no campo do número', async () => {
    const { mx2, url } = await setup();
    const res = await post(url, form(mx2.id));
    const id = res.json().registration.id as string;
    now = minutes(40);
    await post(url, form(mx2.id, { account: account('outro@mxpro.test') }));
    const renewed = await app.inject({ method: 'POST', url: `/api/registrations/${id}/pix`, cookies: { [SESSION_COOKIE]: cookieOf(res)! } });
    expect(renewed.statusCode).toBe(400);
    expect(renewed.json().details[0].field).toBe('raceNumber');
  });

  it('"pago sem vaga": a tela sabe que o Pix foi recebido e NÃO deixa gerar outro', async () => {
    const { mx2, url } = await setup();
    const res = await post(url, form(mx2.id));
    const cookie = cookieOf(res)!;
    const id = res.json().registration.id as string;
    const orderId = mp.last();
    now = minutes(40);
    await post(url, form(mx2.id, { account: account('outro@mxpro.test') })); // pegou o número 27
    mp.set(orderId, 'processed', 'accredited'); // o primeiro Pix foi pago tarde demais
    const seen = (await get(`/api/registrations/${id}`, cookie)).json();
    expect(seen).toMatchObject({ status: 'EXPIRED', paymentReceived: true, pix: null });
    const renew = await app.inject({ method: 'POST', url: `/api/registrations/${id}/pix`, cookies: { [SESSION_COOKIE]: cookie } });
    expect(renew.statusCode).toBe(409);
    expect(renew.json().code).toBe('PAYMENT_RECEIVED');
  });
});

describe('quem vê cada inscrição', () => {
  it('o próprio piloto e a equipe veem; outro piloto recebe 404 (não revela que existe)', async () => {
    const { mx2, url } = await setup();
    const res = await post(url, form(mx2.id));
    const id = res.json().registration.id as string;
    const other = cookieOf(await post(url, form(mx2.id, { raceNumber: '14', account: account('outro@mxpro.test') })))!;
    expect((await get(`/api/registrations/${id}`, other)).statusCode).toBe(404);
    expect((await get('/api/me/registrations', other)).json().registrations).toHaveLength(1);
    const secretary = await actingAs(app, db, 'SECRETARY');
    expect((await secretary('GET', `/api/registrations/${id}`)).statusCode).toBe(200);
    expect((await secretary('POST', `/api/registrations/${id}/pix`, {})).statusCode).toBe(403);
  });
});
