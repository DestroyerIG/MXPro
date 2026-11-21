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

const UNKNOWN_ID = '019a8f00-0000-7000-8000-0000000000aa';

/** Evento de dois dias (13 e 14/03/2027, São Paulo) em rascunho. */
async function createEvent(patch: object = {}) {
  const res = await as('POST', '/api/events', {
    name: 'Etapa de teste', startDate: '2027-03-13', endDate: '2027-03-14', venue: 'Pista', city: 'Campo Largo', state: 'PR', ...patch,
  });
  return res.json() as { id: string };
}
async function createCategory(name: string) {
  return (await as('POST', '/api/categories', { name })).json() as { id: string };
}
/** Categoria do catálogo + inclusão no evento. */
async function addToEvent(eventId: string, name: string, fee = 15000) {
  const category = await createCategory(name);
  const res = await as('POST', `/api/events/${eventId}/categories`, { categoryId: category.id, modality: 'MOTOCROSS', entryFeeCents: fee });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; category: { id: string } };
}

describe('catálogo de categorias', () => {
  it('cria, lista em ordem alfabética brasileira (Master antes de MX, 65cc antes de 125cc) com uso', async () => {
    const event = await createEvent();
    await addToEvent(event.id, 'MX2');
    for (const name of ['Feminino', 'Master 35+', '125cc', '65cc']) await createCategory(name);
    const res = await as('GET', '/api/categories');
    expect(res.json().categories.map((c: { name: string; eventCount: number }) => [c.name, c.eventCount])).toEqual([
      ['65cc', 0],
      ['125cc', 0],
      ['Feminino', 0],
      ['Master 35+', 0],
      ['MX2', 1],
    ]);
  });

  it('"mx2 " repetida (maiúsculas/espaços): 409 CATEGORY_EXISTS', async () => {
    await createCategory('MX2');
    const res = await as('POST', '/api/categories', { name: ' mx2 ' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'CATEGORY_EXISTS', details: [{ field: 'name' }] });
  });

  it('categoria usada não é excluída (desativa); nunca usada, exclui', async () => {
    const event = await createEvent();
    const used = await addToEvent(event.id, 'MX2');
    expect((await as('DELETE', `/api/categories/${used.category.id}`)).json().code).toBe('CATEGORY_IN_USE');
    const off = await as('PATCH', `/api/categories/${used.category.id}`, { active: false });
    expect(off.json().active).toBe(false);
    expect((await as('GET', '/api/categories?active=true')).json().categories).toEqual([]);

    const unused = await createCategory('65cc');
    expect((await as('DELETE', `/api/categories/${unused.id}`)).statusCode).toBe(204);
  });
});

describe('categorias do evento', () => {
  it('inclui com modalidade, valor em centavos e vagas', async () => {
    const event = await createEvent();
    const category = await createCategory('Cross Country');
    const res = await as('POST', `/api/events/${event.id}/categories`, {
      categoryId: category.id, modality: 'CROSS_COUNTRY', entryFeeCents: 12000, maxEntries: 50,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      eventId: event.id, category: { id: category.id, name: 'Cross Country' }, modality: 'CROSS_COUNTRY',
      entryFeeCents: 12000, maxEntries: 50, heatCount: 0,
    });
    expect((await as('GET', `/api/events/${event.id}`)).json().categoryCount).toBe(1);
  });

  it('mesma categoria duas vezes no evento: 409', async () => {
    const event = await createEvent();
    const ec = await addToEvent(event.id, 'MX2');
    const res = await as('POST', `/api/events/${event.id}/categories`, { categoryId: ec.category.id, modality: 'MOTOCROSS', entryFeeCents: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('CATEGORY_ALREADY_IN_EVENT');
  });

  it('categoria inexistente ou desativada: erro no campo', async () => {
    const event = await createEvent();
    const missing = await as('POST', `/api/events/${event.id}/categories`, { categoryId: UNKNOWN_ID, modality: 'MOTOCROSS', entryFeeCents: 1 });
    expect(missing.json().details).toEqual([{ field: 'categoryId', message: 'Categoria não encontrada.' }]);

    const off = await createCategory('Antiga');
    await as('PATCH', `/api/categories/${off.id}`, { active: false });
    const res = await as('POST', `/api/events/${event.id}/categories`, { categoryId: off.id, modality: 'MOTOCROSS', entryFeeCents: 1 });
    expect(res.json().details).toEqual([{ field: 'categoryId', message: 'Esta categoria está desativada no catálogo.' }]);
  });

  it('edita valor e vagas; a categoria em si não troca', async () => {
    const event = await createEvent();
    const ec = await addToEvent(event.id, 'MX2');
    const res = await as('PATCH', `/api/events/${event.id}/categories/${ec.id}`, { entryFeeCents: 18000, maxEntries: null });
    expect(res.json()).toMatchObject({ entryFeeCents: 18000, maxEntries: null });
    expect((await as('PATCH', `/api/events/${event.id}/categories/${ec.id}`, { categoryId: UNKNOWN_ID })).statusCode).toBe(400);
  });

  it('categoria de OUTRO evento pela URL deste: 404', async () => {
    const a = await createEvent();
    const b = await createEvent({ name: 'Outra etapa' });
    const ecOfB = await addToEvent(b.id, 'MX2');
    expect((await as('PATCH', `/api/events/${a.id}/categories/${ecOfB.id}`, { entryFeeCents: 1 })).statusCode).toBe(404);
    expect((await as('DELETE', `/api/events/${a.id}/categories/${ecOfB.id}`)).statusCode).toBe(404);
  });

  it('remove; mas não se estiver em bateria, nem a última de um evento publicado', async () => {
    const event = await createEvent();
    const mx1 = await addToEvent(event.id, 'MX1');
    const mx2 = await addToEvent(event.id, 'MX2');
    await as('POST', `/api/events/${event.id}/heats`, { name: 'Bateria 1', eventCategoryIds: [mx1.id] });

    expect((await as('DELETE', `/api/events/${event.id}/categories/${mx1.id}`)).json().code).toBe('CATEGORY_IN_HEAT');

    await as('POST', `/api/events/${event.id}/publish`);
    expect((await as('DELETE', `/api/events/${event.id}/categories/${mx2.id}`)).statusCode).toBe(204);
    // Agora MX1 é a única; mesmo tirando da bateria, não pode sair de um evento publicado.
    const heats = (await as('GET', `/api/events/${event.id}/heats`)).json().heats;
    await as('DELETE', `/api/events/${event.id}/heats/${heats[0].id}`);
    expect((await as('DELETE', `/api/events/${event.id}/categories/${mx1.id}`)).json().code).toBe('LAST_CATEGORY');
  });

  it('evento cancelado fica congelado', async () => {
    const event = await createEvent();
    await as('POST', `/api/events/${event.id}/cancel`, {});
    const category = await createCategory('MX2');
    const res = await as('POST', `/api/events/${event.id}/categories`, { categoryId: category.id, modality: 'MOTOCROSS', entryFeeCents: 1 });
    expect(res.json().code).toBe('EVENT_LOCKED');
  });
});

describe('baterias', () => {
  it('cria com várias categorias e lista na ordem da programação ("a definir" no fim)', async () => {
    const event = await createEvent();
    const mx2 = await addToEvent(event.id, 'MX2');
    const master = await addToEvent(event.id, 'Master 35+');

    await as('POST', `/api/events/${event.id}/heats`, { name: 'Final', eventCategoryIds: [mx2.id] });
    await as('POST', `/api/events/${event.id}/heats`, { name: 'Bateria 2', scheduledAt: '2027-03-13T14:00:00-03:00', eventCategoryIds: [mx2.id] });
    const joint = await as('POST', `/api/events/${event.id}/heats`, {
      name: 'Bateria 1', scheduledAt: '2027-03-13T09:00:00-03:00', eventCategoryIds: [mx2.id, master.id],
    });
    expect(joint.statusCode).toBe(201);
    expect(joint.json()).toMatchObject({
      name: 'Bateria 1', scheduledAt: '2027-03-13T12:00:00.000Z', status: 'SCHEDULED',
      categories: [{ name: 'Master 35+' }, { name: 'MX2' }],
    });

    const heats = (await as('GET', `/api/events/${event.id}/heats`)).json().heats;
    expect(heats.map((h: { name: string }) => h.name)).toEqual(['Bateria 1', 'Bateria 2', 'Final']);
    expect((await as('GET', `/api/events/${event.id}`)).json().heatCount).toBe(3);
  });

  it('horário fora das datas do evento, considerando o fuso (22h de domingo em SP ainda vale)', async () => {
    const event = await createEvent();
    const mx2 = await addToEvent(event.id, 'MX2');
    const ok = await as('POST', `/api/events/${event.id}/heats`, {
      name: 'Noturna', scheduledAt: '2027-03-15T01:00:00Z', eventCategoryIds: [mx2.id], // 14/03 22:00 em SP
    });
    expect(ok.statusCode).toBe(201);
    const res = await as('POST', `/api/events/${event.id}/heats`, {
      name: 'Fora', scheduledAt: '2027-03-15T09:00:00-03:00', eventCategoryIds: [mx2.id],
    });
    expect(res.json().details).toEqual([
      { field: 'scheduledAt', message: 'O horário precisa ser entre 13/03/2027 e 14/03/2027, nas datas do evento.' },
    ]);
  });

  it('categoria de outro evento: recusada', async () => {
    const event = await createEvent();
    const other = await createEvent({ name: 'Outra' });
    const foreign = await addToEvent(other.id, 'MX2');
    const res = await as('POST', `/api/events/${event.id}/heats`, { name: 'Bateria 1', eventCategoryIds: [foreign.id] });
    expect(res.json().details).toEqual([{ field: 'eventCategoryIds', message: 'Escolha só categorias deste evento.' }]);
    expect(await db.heat.count()).toBe(0);
  });

  it('edita nome, horário e troca as categorias de uma vez', async () => {
    const event = await createEvent();
    const mx1 = await addToEvent(event.id, 'MX1');
    const mx2 = await addToEvent(event.id, 'MX2');
    const heat = (await as('POST', `/api/events/${event.id}/heats`, { name: 'Bat 1', eventCategoryIds: [mx1.id] })).json();
    const res = await as('PATCH', `/api/events/${event.id}/heats/${heat.id}`, {
      name: 'Bateria 1', scheduledAt: '2027-03-13T10:00:00-03:00', eventCategoryIds: [mx2.id],
    });
    expect(res.json()).toMatchObject({ name: 'Bateria 1', scheduledAt: '2027-03-13T13:00:00.000Z', categories: [{ name: 'MX2' }] });
    // A ligação antiga sumiu: MX1 pode sair do evento.
    expect((await as('DELETE', `/api/events/${event.id}/categories/${mx1.id}`)).statusCode).toBe(204);
  });

  it('troca de categorias inválida não altera nada (tudo ou nada)', async () => {
    const event = await createEvent();
    const mx1 = await addToEvent(event.id, 'MX1');
    const heat = (await as('POST', `/api/events/${event.id}/heats`, { name: 'Bat 1', eventCategoryIds: [mx1.id] })).json();
    const res = await as('PATCH', `/api/events/${event.id}/heats/${heat.id}`, { name: 'Novo nome', eventCategoryIds: [UNKNOWN_ID] });
    expect(res.statusCode).toBe(400);
    const after = (await as('GET', `/api/events/${event.id}/heats`)).json().heats[0];
    expect(after).toMatchObject({ name: 'Bat 1', categories: [{ name: 'MX1' }] });
  });

  it('bateria já iniciada não é editada nem excluída', async () => {
    const event = await createEvent();
    const mx1 = await addToEvent(event.id, 'MX1');
    const heat = (await as('POST', `/api/events/${event.id}/heats`, { name: 'Bat 1', eventCategoryIds: [mx1.id] })).json();
    await db.heat.update({ where: { id: heat.id }, data: { status: 'IN_PROGRESS' } }); // a cronometragem fará isso (fase 5)
    expect((await as('PATCH', `/api/events/${event.id}/heats/${heat.id}`, { name: 'x' })).json().code).toBe('HEAT_LOCKED');
    expect((await as('DELETE', `/api/events/${event.id}/heats/${heat.id}`)).json().code).toBe('HEAT_LOCKED');
  });

  it('bateria de outro evento pela URL deste: 404', async () => {
    const a = await createEvent();
    const b = await createEvent({ name: 'Outra' });
    const mx = await addToEvent(b.id, 'MX1');
    const heatOfB = (await as('POST', `/api/events/${b.id}/heats`, { name: 'Bat', eventCategoryIds: [mx.id] })).json();
    expect((await as('DELETE', `/api/events/${a.id}/heats/${heatOfB.id}`)).statusCode).toBe(404);
    expect(await db.heat.count()).toBe(1);
  });
});

describe('permissões', () => {
  it('secretaria consulta catálogo, categorias e baterias, mas não altera', async () => {
    const event = await createEvent();
    const ec = await addToEvent(event.id, 'MX2');
    const asSecretary = await actingAs(app, db, 'SECRETARY');
    for (const url of ['/api/categories', `/api/events/${event.id}/categories`, `/api/events/${event.id}/heats`]) {
      expect((await asSecretary('GET', url)).statusCode, url).toBe(200);
    }
    for (const [method, url] of [
      ['POST', '/api/categories'],
      ['POST', `/api/events/${event.id}/categories`],
      ['PATCH', `/api/events/${event.id}/categories/${ec.id}`],
      ['POST', `/api/events/${event.id}/heats`],
    ] as const) {
      expect((await asSecretary(method, url, {})).statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('cronometrista não acessa (vai ler as baterias pela tela de pista, na fase 5)', async () => {
    const event = await createEvent();
    const asTimekeeper = await actingAs(app, db, 'TIMEKEEPER');
    expect((await asTimekeeper('GET', `/api/events/${event.id}/heats`)).statusCode).toBe(403);
  });
});
