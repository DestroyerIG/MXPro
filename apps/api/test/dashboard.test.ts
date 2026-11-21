import type { PrismaClient } from '@mxpro/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actingAs, integrationApp, resetDb, testDb } from './db-helpers.ts';

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

/** Evento com MX2 (motocross), Cross Country e Master 35+; baterias em ordem embaralhada. */
async function seedEvent() {
  const event = (
    await as('POST', '/api/events', {
      name: 'Etapa 2', startDate: '2027-03-13', endDate: '2027-03-13', venue: 'Pista', city: 'Campo Largo', state: 'PR',
    })
  ).json();
  const add = async (name: string, modality: string) => {
    const category = (await as('POST', '/api/categories', { name })).json();
    return (await as('POST', `/api/events/${event.id}/categories`, { categoryId: category.id, modality, entryFeeCents: 15000 })).json();
  };
  const mx2 = await add('MX2', 'MOTOCROSS');
  const xc = await add('Cross Country', 'CROSS_COUNTRY');
  const master = await add('Master 35+', 'MOTOCROSS');
  const heat = (name: string, scheduledAt: string | null, ids: string[]) =>
    as('POST', `/api/events/${event.id}/heats`, { name, scheduledAt, eventCategoryIds: ids });
  await heat('Final', null, [mx2.id]);
  await heat('Bateria 2', '2027-03-13T11:00:00-03:00', [xc.id]);
  const first = (await heat('Bateria 1', '2027-03-13T09:00:00-03:00', [mx2.id, master.id])).json();
  return { event, first };
}

describe('GET /api/events/:id/dashboard', () => {
  it('reúne evento, modalidades, próximas baterias (na ordem da programação) e categorias', async () => {
    const { event } = await seedEvent();
    const res = await as('GET', `/api/events/${event.id}/dashboard`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.event).toMatchObject({ id: event.id, name: 'Etapa 2', categoryCount: 3, heatCount: 3 });
    expect(body.modalities).toEqual(['MOTOCROSS', 'CROSS_COUNTRY']);
    expect(body.heatCount).toBe(3);
    expect(body.upcomingHeats).toEqual([
      expect.objectContaining({ name: 'Bateria 1', scheduledAt: '2027-03-13T12:00:00.000Z', categoryNames: ['Master 35+', 'MX2'], status: 'WAITING', pilotCount: 0 }),
      expect.objectContaining({ name: 'Bateria 2', categoryNames: ['Cross Country'] }),
      expect.objectContaining({ name: 'Final', scheduledAt: null }),
    ]);
    expect(body.registrationsByCategory.map((c: { categoryName: string; count: number }) => [c.categoryName, c.count])).toEqual([
      ['Cross Country', 0],
      ['Master 35+', 0],
      ['MX2', 0],
    ]);
    // Inscrições ainda não existem: totais zerados (sem inventar números).
    expect(body.registrations).toEqual({ total: 0, paid: 0 });
  });

  it('bateria encerrada sai de "próximas"', async () => {
    const { event, first } = await seedEvent();
    await db.heat.update({ where: { id: first.id }, data: { status: 'FINISHED' } });
    const body = (await as('GET', `/api/events/${event.id}/dashboard`)).json();
    expect(body.upcomingHeats.map((h: { name: string }) => h.name)).toEqual(['Bateria 2', 'Final']);
    expect(body.heatCount).toBe(3); // o total continua contando todas
  });

  it('evento sem categorias nem baterias: listas vazias', async () => {
    const event = (
      await as('POST', '/api/events', { name: 'Vazio', startDate: '2027-05-01', endDate: '2027-05-01', venue: 'Pista', city: 'Lages', state: 'SC' })
    ).json();
    const body = (await as('GET', `/api/events/${event.id}/dashboard`)).json();
    expect(body).toMatchObject({ modalities: [], upcomingHeats: [], registrationsByCategory: [], heatCount: 0 });
  });

  it('evento inexistente: 404; secretaria vê; cronometrista não', async () => {
    const { event } = await seedEvent();
    expect((await as('GET', '/api/events/019a8f00-0000-7000-8000-0000000000aa/dashboard')).statusCode).toBe(404);
    expect((await (await actingAs(app, db, 'SECRETARY'))('GET', `/api/events/${event.id}/dashboard`)).statusCode).toBe(200);
    expect((await (await actingAs(app, db, 'TIMEKEEPER'))('GET', `/api/events/${event.id}/dashboard`)).statusCode).toBe(403);
  });
});
