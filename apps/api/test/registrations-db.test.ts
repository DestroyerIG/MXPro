import type { PrismaClient } from '@mxpro/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actingAs, createUser, integrationApp, resetDb, testDb } from './db-helpers.ts';

/**
 * Regras de inscrição garantidas pelo PRÓPRIO BANCO (migration inscricoes_pagamentos, ADR 0004).
 * Mesmo que um service erre, o banco recusa: nº de largada repetido, piloto duplicado na
 * categoria, inscrição sem prazo de reserva, cobrança em aberto duplicada…
 */

let db: PrismaClient;
let app: Awaited<ReturnType<typeof integrationApp>>;
let as: Awaited<ReturnType<typeof actingAs>>;

beforeAll(() => {
  db = testDb();
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await app?.close();
  await resetDb(db);
  app = await integrationApp(db);
  as = await actingAs(app, db, 'ORGANIZER');
});

async function setup() {
  const event = (
    await as('POST', '/api/events', { name: 'Etapa', startDate: '2027-03-13', endDate: '2027-03-13', venue: 'Pista', city: 'Lages', state: 'SC' })
  ).json();
  const category = (await as('POST', '/api/categories', { name: 'MX2' })).json();
  const ec = (await as('POST', `/api/events/${event.id}/categories`, { categoryId: category.id, modality: 'MOTOCROSS', entryFeeCents: 15000 })).json();
  const pilot = await createUser(db, { email: `p-${Math.random().toString(36).slice(2, 8)}@mxpro.test`, role: 'PILOT' });
  return { event, ec, pilot };
}

const HOLD = () => new Date(Date.now() + 30 * 60_000);

function registration(s: Awaited<ReturnType<typeof setup>>, patch: Record<string, unknown> = {}) {
  return db.registration.create({
    data: {
      eventId: s.event.id,
      eventCategoryId: s.ec.id,
      pilotId: s.pilot.id,
      raceNumber: '27',
      bike: 'Honda CRF 250F',
      entryFeeCents: 15000,
      holdExpiresAt: HOLD(),
      ...patch,
    },
  });
}

describe('inscrições: regras do banco', () => {
  it('nº de largada é texto de 1 a 3 dígitos ("05" vale; "1000" e "A1" não)', async () => {
    const s = await setup();
    await expect(registration(s, { raceNumber: '05' })).resolves.toMatchObject({ raceNumber: '05' });
    const other = await createUser(db, { email: 'outro@mxpro.test', role: 'PILOT' });
    await expect(registration(s, { pilotId: other.id, raceNumber: '1000' })).rejects.toThrow();
    await expect(registration(s, { pilotId: other.id, raceNumber: 'A1' })).rejects.toThrow();
  });

  it('o mesmo número não se repete entre inscrições ATIVAS da categoria; vencida libera o número', async () => {
    const s = await setup();
    const first = await registration(s);
    const other = await createUser(db, { email: 'outro@mxpro.test', role: 'PILOT' });
    await expect(registration(s, { pilotId: other.id })).rejects.toThrow(/race_number|Unique/i);
    // "05" e "5" são números diferentes.
    await expect(registration(s, { pilotId: other.id, raceNumber: '027' })).resolves.toBeTruthy();

    await db.registration.update({ where: { id: first.id }, data: { status: 'EXPIRED', holdExpiresAt: null } });
    const third = await createUser(db, { email: 'terceiro@mxpro.test', role: 'PILOT' });
    await expect(registration(s, { pilotId: third.id })).resolves.toMatchObject({ raceNumber: '27' });
  });

  it('um piloto tem uma inscrição ativa por categoria (pode voltar depois de vencida)', async () => {
    const s = await setup();
    const first = await registration(s);
    await expect(registration(s, { raceNumber: '28' })).rejects.toThrow();
    await db.registration.update({ where: { id: first.id }, data: { status: 'EXPIRED', holdExpiresAt: null } });
    await expect(registration(s, { raceNumber: '28' })).resolves.toBeTruthy();
  });

  it('aguardando pagamento exige prazo de reserva; confirmada exige data e não tem reserva', async () => {
    const s = await setup();
    await expect(registration(s, { holdExpiresAt: null })).rejects.toThrow();
    await expect(registration(s, { status: 'CONFIRMED', confirmedAt: null, holdExpiresAt: null })).rejects.toThrow();
    await expect(registration(s, { status: 'CONFIRMED', confirmedAt: new Date() })).rejects.toThrow(); // com reserva
    await expect(registration(s, { status: 'CONFIRMED', confirmedAt: new Date(), holdExpiresAt: null })).resolves.toBeTruthy();
  });

  it('categoria precisa ser do mesmo evento da inscrição (FK composta)', async () => {
    const s = await setup();
    const other = (
      await as('POST', '/api/events', { name: 'Outra', startDate: '2027-04-01', endDate: '2027-04-01', venue: 'P', city: 'Lages', state: 'SC' })
    ).json();
    await expect(registration(s, { eventId: other.id })).rejects.toThrow();
  });

  it('no máximo uma cobrança Pix em aberto por inscrição', async () => {
    const s = await setup();
    const r = await registration(s);
    const charge = (n: number) => ({
      registrationId: r.id, provider: 'fake', providerChargeId: `c${n}`, amountCents: 15000, pixCopyPaste: 'pix', expiresAt: HOLD(),
    });
    await db.payment.create({ data: charge(1) });
    await expect(db.payment.create({ data: charge(2) })).rejects.toThrow();
    await db.payment.updateMany({ where: { registrationId: r.id }, data: { status: 'EXPIRED' } });
    await expect(db.payment.create({ data: charge(2) })).resolves.toBeTruthy();
  });

  it('webhook repetido (mesmo id de evento do gateway) é recusado pelo banco', async () => {
    const event = { provider: 'fake', providerEventId: 'evt-1', payload: { type: 'charge.paid' } };
    await db.paymentWebhookEvent.create({ data: event });
    await expect(db.paymentWebhookEvent.create({ data: event })).rejects.toThrow();
  });

  it('termo de responsabilidade é sempre de uma inscrição; política de privacidade, da conta', async () => {
    const s = await setup();
    const r = await registration(s);
    const base = { userId: s.pilot.id, documentVersion: '2026-11' };
    await expect(db.consent.create({ data: { ...base, kind: 'LIABILITY_WAIVER' } })).rejects.toThrow();
    await expect(db.consent.create({ data: { ...base, kind: 'PRIVACY_POLICY', registrationId: r.id } })).rejects.toThrow();
    await expect(db.consent.create({ data: { ...base, kind: 'LIABILITY_WAIVER', registrationId: r.id } })).resolves.toBeTruthy();
  });
});

describe('categoria do evento com inscrições', () => {
  it('não sai do evento (mesmo com a inscrição vencida): 409 com mensagem clara', async () => {
    const s = await setup();
    await registration(s, { status: 'EXPIRED', holdExpiresAt: null });
    const res = await as('DELETE', `/api/events/${s.event.id}/categories/${s.ec.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('CATEGORY_HAS_REGISTRATIONS');
    expect(await db.eventCategory.count()).toBe(1);
  });
});
