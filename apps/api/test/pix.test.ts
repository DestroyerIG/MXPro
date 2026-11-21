import type { PrismaClient } from '@mxpro/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hmac, manifest } from '../src/payments/mercadopago/webhook-signature.ts';
import { applyOrder, createPixCharge, refreshPaymentIfStale, syncPayment } from '../src/payments/pix.service.ts';
import { pixDeps } from '../src/routes/payments.ts';
import { actingAs, createUser, integrationApp, resetDb, testDb } from './db-helpers.ts';
import { MP_ENV, MP_WEBHOOK_SECRET as WEBHOOK_SECRET, SELLER_TOKEN, connectSellerAccount, fakeOAuth, fakeOrders } from './mp-fakes.ts';

/**
 * Cobrança Pix e webhook com o Mercado Pago SIMULADO em memória (sem rede).
 * O "Mercado Pago" de mentira guarda os pedidos; o teste muda o estado deles como o banco do pagador faria.
 */

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

const deps = () => pixDeps(app);
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

/** Evento com uma categoria (vagas opcionais) e uma inscrição aguardando pagamento. */
async function setup({ maxEntries = null as number | null } = {}) {
  const as = await actingAs(app, db, 'ORGANIZER');
  const event = (
    await as('POST', '/api/events', { name: 'Copa Verão - Etapa 2', startDate: '2027-03-13', endDate: '2027-03-13', venue: 'Pista', city: 'Lages', state: 'SC' })
  ).json();
  const category = (await as('POST', '/api/categories', { name: 'MX2' })).json();
  const ec = (await as('POST', `/api/events/${event.id}/categories`, { categoryId: category.id, modality: 'MOTOCROSS', entryFeeCents: 15000, maxEntries })).json();
  const pilot = await createUser(db, { email: 'rafael@mxpro.test', role: 'PILOT', name: 'Rafael Menezes' });
  const registration = await db.registration.create({
    data: { eventId: event.id, eventCategoryId: ec.id, pilotId: pilot.id, raceNumber: '27', bike: 'Honda CRF 250F', entryFeeCents: 15000, holdExpiresAt: minutes(30) },
  });
  return { event, ec, pilot, registration };
}

/** Webhook assinado como o Mercado Pago assina (x-signature + x-request-id). */
function webhook(orderId: string, { requestId = `req-${orderId}-${Math.random()}`, secret = WEBHOOK_SECRET, type = 'order' } = {}) {
  const ts = String(Math.floor(now.getTime() / 1000));
  return app.inject({
    method: 'POST',
    url: `/api/payments/mercadopago/webhook?data.id=${orderId}&type=${type}`,
    headers: { 'x-signature': `ts=${ts},v1=${hmac(manifest(orderId, requestId, ts), secret)}`, 'x-request-id': requestId },
    payload: { type, action: 'order.processed', data: { id: orderId } },
  });
}
const state = async (registrationId: string) => {
  const r = await db.registration.findUniqueOrThrow({ where: { id: registrationId }, include: { payments: { orderBy: { createdAt: 'asc' } } } });
  return { reg: r.status, hold: r.holdExpiresAt, payments: r.payments.map((p) => p.status) };
};

describe('gerar o Pix', () => {
  it('cria o pedido na conta do VENDEDOR, com chave de idempotência, valor, e-mail e validade de 30 min', async () => {
    const { registration } = await setup();
    const pix = await createPixCharge(deps(), registration.id);
    expect(pix).toMatchObject({ status: 'PENDING', amountCents: 15000, expiresAt: minutes(30).toISOString() });
    expect(pix.pixCopyPaste).toMatch(/^00020101PIX/);
    const [{ token, input }] = mp.created as [(typeof mp.created)[number]];
    expect(token).toBe(SELLER_TOKEN);
    expect(input).toMatchObject({
      idempotencyKey: pix.paymentId,
      externalReference: registration.id,
      amountCents: 15000,
      payerEmail: 'rafael@mxpro.test',
      expiresInMinutes: 30,
      description: 'Inscrição MX2 - Copa Verão - Etapa 2',
    });
    expect((await state(registration.id)).hold?.toISOString()).toBe(minutes(30).toISOString());
  });

  it('pedir de novo enquanto vale devolve o MESMO Pix (não cria outro no Mercado Pago)', async () => {
    const { registration } = await setup();
    const a = await createPixCharge(deps(), registration.id);
    now = minutes(10);
    const b = await createPixCharge(deps(), registration.id);
    expect(b.paymentId).toBe(a.paymentId);
    expect(mp.api.createPixOrder).toHaveBeenCalledTimes(1);
  });

  it('recusas: inscrição não pendente, prazo vencido, conta desconectada, Mercado Pago fora do ar', async () => {
    const { registration } = await setup();
    now = minutes(31);
    await expect(createPixCharge(deps(), registration.id)).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
    now = minutes(-31);
    mp.api.createPixOrder.mockRejectedValueOnce(new Error('timeout'));
    await expect(createPixCharge(deps(), registration.id)).rejects.toMatchObject({ statusCode: 502, code: 'MP_UNAVAILABLE' });
    expect(await db.payment.count()).toBe(0);
    await db.mercadoPagoAccount.deleteMany();
    await expect(createPixCharge(deps(), registration.id)).rejects.toMatchObject({ code: 'MP_NOT_CONNECTED' });
    await db.registration.update({ where: { id: registration.id }, data: { status: 'CONFIRMED', confirmedAt: now, holdExpiresAt: null } });
    await expect(createPixCharge(deps(), registration.id)).rejects.toMatchObject({ code: 'REGISTRATION_NOT_PENDING' });
  });
});

describe('webhook', () => {
  it('Pix pago: confirma a inscrição; o mesmo aviso de novo não muda nada', async () => {
    const { registration } = await setup();
    const pix = await createPixCharge(deps(), registration.id);
    const orderId = [...mp.orders.keys()][0]!;
    mp.set(orderId, 'processed', 'accredited');
    const res = await webhook(orderId, { requestId: 'req-1' });
    expect(res.statusCode).toBe(200);
    expect(await state(registration.id)).toEqual({ reg: 'CONFIRMED', hold: null, payments: ['PAID'] });
    const paid = await db.payment.findUniqueOrThrow({ where: { id: pix.paymentId } });
    expect(paid.paidAt?.toISOString()).toBe(now.toISOString());

    expect((await webhook(orderId, { requestId: 'req-1' })).statusCode).toBe(200);
    expect(mp.api.getOrder).toHaveBeenCalledTimes(1); // aviso repetido nem consulta
    expect(await db.paymentWebhookEvent.count()).toBe(1);
  });

  it('nunca confia no aviso: se o Mercado Pago ainda diz "aguardando", nada é confirmado', async () => {
    const { registration } = await setup();
    await createPixCharge(deps(), registration.id);
    const orderId = [...mp.orders.keys()][0]!;
    expect((await webhook(orderId)).statusCode).toBe(200); // corpo diz "order.processed", mas o pedido não foi pago
    expect((await state(registration.id)).reg).toBe('PENDING_PAYMENT');
  });

  it('assinatura inválida: 401 e nada é consultado nem gravado', async () => {
    const { registration } = await setup();
    await createPixCharge(deps(), registration.id);
    const orderId = [...mp.orders.keys()][0]!;
    mp.set(orderId, 'processed', 'accredited');
    const res = await webhook(orderId, { secret: 'segredo-errado' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
    expect(mp.api.getOrder).not.toHaveBeenCalled();
    expect(await db.paymentWebhookEvent.count()).toBe(0);
    expect((await state(registration.id)).reg).toBe('PENDING_PAYMENT');
  });

  it('pedido que não é nosso (outra venda da conta) e outros tópicos: 200, ignorados', async () => {
    await setup();
    expect((await webhook('ORD-DE-OUTRA-VENDA')).statusCode).toBe(200);
    expect((await webhook('123', { type: 'payment' })).statusCode).toBe(200);
    expect(mp.api.getOrder).not.toHaveBeenCalled();
  });

  it('valor pago menor que o da inscrição: não confirma', async () => {
    const { registration } = await setup();
    await createPixCharge(deps(), registration.id);
    const orderId = [...mp.orders.keys()][0]!;
    mp.set(orderId, 'processed', 'accredited', '1.50');
    await webhook(orderId);
    expect(await state(registration.id)).toMatchObject({ reg: 'PENDING_PAYMENT', payments: ['PENDING'] });
  });

  it('Pix vencido: libera a vaga (inscrição vencida)', async () => {
    const { registration } = await setup();
    await createPixCharge(deps(), registration.id);
    const orderId = [...mp.orders.keys()][0]!;
    now = minutes(31);
    mp.set(orderId, 'canceled', 'expired');
    await webhook(orderId);
    expect(await state(registration.id)).toEqual({ reg: 'EXPIRED', hold: null, payments: ['EXPIRED'] });
  });

  it('estorno: pagamento estornado e inscrição cancelada', async () => {
    const { registration } = await setup();
    await createPixCharge(deps(), registration.id);
    const orderId = [...mp.orders.keys()][0]!;
    mp.set(orderId, 'processed', 'accredited');
    await webhook(orderId);
    mp.set(orderId, 'refunded', 'refunded');
    await webhook(orderId);
    expect(await state(registration.id)).toMatchObject({ reg: 'CANCELED', payments: ['REFUNDED'] });
  });
});

describe('pago depois de a reserva vencer (ADR 0004)', () => {
  async function paidLate(opts: { maxEntries?: number | null } = {}) {
    const s = await setup(opts);
    const pix = await createPixCharge(deps(), s.registration.id);
    const orderId = [...mp.orders.keys()][0]!;
    // Venceu sem pagamento…
    now = minutes(31);
    mp.set(orderId, 'canceled', 'expired');
    await syncPayment(deps(), pix.paymentId);
    return { ...s, pix, orderId };
  }

  it('com vaga e número livres: confirma', async () => {
    const { registration, pix, orderId } = await paidLate();
    mp.set(orderId, 'processed', 'accredited'); // …mas o banco do piloto liquidou depois
    expect(await syncPayment(deps(), pix.paymentId)).toBe('paid');
    expect(await state(registration.id)).toMatchObject({ reg: 'CONFIRMED', payments: ['PAID'] });
  });

  it('número já pego por outro piloto: fica "pago sem vaga" para a secretaria resolver', async () => {
    const { registration, pix, orderId, event, ec } = await paidLate();
    const other = await createUser(db, { email: 'outro@mxpro.test', role: 'PILOT' });
    await db.registration.create({
      data: { eventId: event.id, eventCategoryId: ec.id, pilotId: other.id, raceNumber: '27', bike: 'KTM', entryFeeCents: 15000, holdExpiresAt: minutes(30) },
    });
    mp.set(orderId, 'processed', 'accredited');
    expect(await syncPayment(deps(), pix.paymentId)).toBe('paid-no-slot');
    expect(await state(registration.id)).toMatchObject({ reg: 'EXPIRED', payments: ['PAID'] });
  });

  it('categoria lotada: fica "pago sem vaga"', async () => {
    const { registration, pix, orderId, event, ec } = await paidLate({ maxEntries: 1 });
    const other = await createUser(db, { email: 'outro@mxpro.test', role: 'PILOT' });
    await db.registration.create({
      data: { eventId: event.id, eventCategoryId: ec.id, pilotId: other.id, raceNumber: '14', bike: 'KTM', entryFeeCents: 15000, status: 'CONFIRMED', confirmedAt: now },
    });
    mp.set(orderId, 'processed', 'accredited');
    expect(await syncPayment(deps(), pix.paymentId)).toBe('paid-no-slot');
    expect((await state(registration.id)).reg).toBe('EXPIRED');
  });
});

describe('consulta pela tela de espera (funciona mesmo sem webhook)', () => {
  it('consulta o Mercado Pago no máximo a cada 10 s e confirma quando pago', async () => {
    const { registration } = await setup();
    const pix = await createPixCharge(deps(), registration.id); // lastCheckedAt = agora
    const orderId = [...mp.orders.keys()][0]!;
    await refreshPaymentIfStale(deps(), pix.paymentId);
    expect(mp.api.getOrder).not.toHaveBeenCalled(); // acabou de ser criado
    now = new Date(now.getTime() + 11_000);
    mp.set(orderId, 'processed', 'accredited');
    await Promise.all([refreshPaymentIfStale(deps(), pix.paymentId), refreshPaymentIfStale(deps(), pix.paymentId)]);
    expect(mp.api.getOrder).toHaveBeenCalledTimes(1); // dois celulares, uma consulta
    expect((await state(registration.id)).reg).toBe('CONFIRMED');
  });

  it('webhook e consulta chegando JUNTOS confirmam uma vez só', async () => {
    const { registration } = await setup();
    const pix = await createPixCharge(deps(), registration.id);
    const orderId = [...mp.orders.keys()][0]!;
    mp.set(orderId, 'processed', 'accredited');
    const order = mp.orders.get(orderId)!;
    const results = await Promise.all([1, 2, 3].map(() => applyOrder(db, pix.paymentId, order, now)));
    expect(results.filter((r) => r === 'paid')).toHaveLength(1);
    expect(results.filter((r) => r === 'unchanged')).toHaveLength(2);
  });

  it('pagamentos fictícios do seed não são consultados', async () => {
    const { registration } = await setup();
    const p = await db.payment.create({
      data: { registrationId: registration.id, provider: 'seed', providerChargeId: 'seed-1', amountCents: 15000, pixCopyPaste: 'x', expiresAt: minutes(30) },
    });
    expect(await syncPayment(deps(), p.id)).toBe('unchanged');
    expect(mp.api.getOrder).not.toHaveBeenCalled();
  });
});
