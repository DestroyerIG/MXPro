import type { PrismaClient } from '@mxpro/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actingAs, integrationApp, resetDb, testDb } from './db-helpers.ts';

let db: PrismaClient;
let app: Awaited<ReturnType<typeof integrationApp>>;
let asOrganizer: Awaited<ReturnType<typeof actingAs>>;

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
  asOrganizer = await actingAs(app, db, 'ORGANIZER');
});

const EVENT = {
  name: 'Copa Verão de Motocross - Etapa 2',
  startDate: '2027-03-13',
  endDate: '2027-03-13',
  venue: 'Pista Terra Vermelha',
  city: 'Campo Largo',
  state: 'PR',
};
const UNKNOWN_ID = '019a8f00-0000-7000-8000-0000000000aa';

async function createEvent(patch: object = {}) {
  const res = await asOrganizer('POST', '/api/events', { ...EVENT, ...patch });
  expect(res.statusCode).toBe(201);
  return res.json();
}
async function createChampionship(name = 'Copa Verão de Motocross', season = 2027) {
  const res = await asOrganizer('POST', '/api/championships', { name, season });
  expect(res.statusCode).toBe(201);
  return res.json();
}
/** Categoria ligada direto no banco (a API de categorias do evento chega no próximo passo). */
async function addCategory(eventId: string, name = 'MX2') {
  const category = await db.category.create({ data: { name } });
  return db.eventCategory.create({ data: { eventId, categoryId: category.id, modality: 'MOTOCROSS', entryFeeCents: 15000 } });
}

describe('campeonatos', () => {
  it('organizador cria e a lista mostra a contagem de etapas', async () => {
    const champ = await createChampionship();
    await createEvent({ championshipId: champ.id, stageNumber: 1 });
    const res = await asOrganizer('GET', '/api/championships');
    expect(res.json().championships).toEqual([{ id: champ.id, name: 'Copa Verão de Motocross', season: 2027, eventCount: 1 }]);
  });

  it('nome + temporada repetidos: 409 com mensagem no campo', async () => {
    await createChampionship();
    const res = await asOrganizer('POST', '/api/championships', { name: 'Copa Verão de Motocross', season: 2027 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'CHAMPIONSHIP_EXISTS', details: [{ field: 'name' }] });
    // Mesma copa em outra temporada é outro campeonato.
    expect((await asOrganizer('POST', '/api/championships', { name: 'Copa Verão de Motocross', season: 2028 })).statusCode).toBe(201);
  });

  it('não exclui campeonato com etapas; sem etapas, exclui', async () => {
    const champ = await createChampionship();
    const event = await createEvent({ championshipId: champ.id, stageNumber: 1 });
    expect((await asOrganizer('DELETE', `/api/championships/${champ.id}`)).json().code).toBe('CHAMPIONSHIP_HAS_EVENTS');
    await asOrganizer('DELETE', `/api/events/${event.id}`);
    expect((await asOrganizer('DELETE', `/api/championships/${champ.id}`)).statusCode).toBe(204);
  });

  it('renomeia', async () => {
    const champ = await createChampionship();
    const res = await asOrganizer('PATCH', `/api/championships/${champ.id}`, { name: 'Copa Verão MX' });
    expect(res.json()).toMatchObject({ name: 'Copa Verão MX', season: 2027 });
  });
});

describe('POST /api/events', () => {
  it('cria como rascunho, avulso, no fuso de São Paulo e com inscrições fechadas', async () => {
    const event = await createEvent();
    expect(event).toMatchObject({
      ...EVENT,
      status: 'DRAFT',
      championship: null,
      stageNumber: null,
      timeZone: 'America/Sao_Paulo',
      registration: { opensAt: null, closesAt: null, closedEarly: false, isOpen: false },
      categoryCount: 0,
      heatCount: 0,
    });
  });

  it('etapa de campeonato; a mesma etapa duas vezes: 409 STAGE_TAKEN', async () => {
    const champ = await createChampionship();
    const event = await createEvent({ championshipId: champ.id, stageNumber: 2 });
    expect(event.championship).toEqual({ id: champ.id, name: 'Copa Verão de Motocross', season: 2027 });
    const res = await asOrganizer('POST', '/api/events', { ...EVENT, championshipId: champ.id, stageNumber: 2 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'STAGE_TAKEN', message: 'Este campeonato já tem a etapa 2.' });
  });

  it('campeonato inexistente: erro no campo', async () => {
    const res = await asOrganizer('POST', '/api/events', { ...EVENT, championshipId: UNKNOWN_ID });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual([{ field: 'championshipId', message: 'Campeonato não encontrado.' }]);
  });

  it('dados inválidos: 400 com mensagens em português por campo', async () => {
    const res = await asOrganizer('POST', '/api/events', { ...EVENT, state: 'XX', endDate: '2027-03-12' });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual(
      expect.arrayContaining([
        { field: 'state', message: 'UF inválida.' },
      ]),
    );
  });

  it('término antes do início', async () => {
    const res = await asOrganizer('POST', '/api/events', { ...EVENT, endDate: '2027-03-12' });
    expect(res.json().details).toEqual([{ field: 'endDate', message: 'O término não pode ser antes do início.' }]);
  });
});

describe('GET /api/events', () => {
  it('lista por data e filtra por status', async () => {
    const later = await createEvent({ name: 'Etapa 3', startDate: '2027-04-17', endDate: '2027-04-18' });
    const sooner = await createEvent({ name: 'Etapa 2' });
    await addCategory(sooner.id);
    await asOrganizer('POST', `/api/events/${sooner.id}/publish`);

    const all = (await asOrganizer('GET', '/api/events')).json().events;
    expect(all.map((e: { name: string }) => e.name)).toEqual(['Etapa 2', 'Etapa 3']);
    const drafts = (await asOrganizer('GET', '/api/events?status=DRAFT')).json().events;
    expect(drafts.map((e: { id: string }) => e.id)).toEqual([later.id]);
  });

  it('filtro inválido: 400', async () => {
    expect((await asOrganizer('GET', '/api/events?status=QUALQUER')).statusCode).toBe(400);
  });

  it('detalhe; id desconhecido ou malformado: 404', async () => {
    const event = await createEvent();
    expect((await asOrganizer('GET', `/api/events/${event.id}`)).json().id).toBe(event.id);
    for (const id of [UNKNOWN_ID, 'nao-e-um-uuid']) {
      const res = await asOrganizer('GET', `/api/events/${id}`);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ code: 'EVENT_NOT_FOUND', message: 'Evento não encontrado.' });
    }
  });
});

describe('PATCH /api/events/:id', () => {
  it('altera só o que foi enviado', async () => {
    const event = await createEvent();
    const res = await asOrganizer('PATCH', `/api/events/${event.id}`, { venue: 'Arena Nova', state: 'sc' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ venue: 'Arena Nova', state: 'SC', name: EVENT.name, city: EVENT.city });
  });

  it('valida o RESULTADO: mudar só o início para depois do término é recusado', async () => {
    const event = await createEvent();
    const res = await asOrganizer('PATCH', `/api/events/${event.id}`, { startDate: '2027-03-20' });
    expect(res.json().details).toEqual([{ field: 'endDate', message: 'O término não pode ser antes do início.' }]);
  });

  it('campo desconhecido (ex.: status) é recusado: status só muda pelas ações', async () => {
    const event = await createEvent();
    expect((await asOrganizer('PATCH', `/api/events/${event.id}`, { status: 'PUBLISHED' })).statusCode).toBe(400);
  });

  it('tirar do campeonato também tira o número da etapa', async () => {
    const champ = await createChampionship();
    const event = await createEvent({ championshipId: champ.id, stageNumber: 2 });
    const res = await asOrganizer('PATCH', `/api/events/${event.id}`, { championshipId: null });
    expect(res.json()).toMatchObject({ championship: null, stageNumber: null });
  });

  it('janela de inscrições: abre no passado e fecha no futuro → isOpen quando publicado', async () => {
    const event = await createEvent();
    await addCategory(event.id);
    const opensAt = new Date(Date.now() - 86_400_000).toISOString();
    const closesAt = new Date(Date.now() + 86_400_000).toISOString();
    await asOrganizer('PATCH', `/api/events/${event.id}`, { registrationOpensAt: opensAt, registrationClosesAt: closesAt });
    const published = (await asOrganizer('POST', `/api/events/${event.id}/publish`)).json();
    expect(published.registration).toEqual({ opensAt, closesAt, closedEarly: false, isOpen: true });

    // "Fechar agora": fecha mesmo dentro da janela.
    const closed = (await asOrganizer('PATCH', `/api/events/${event.id}`, { registrationClosedEarly: true })).json();
    expect(closed.registration.isOpen).toBe(false);
  });

  it('evento cancelado não pode ser alterado', async () => {
    const event = await createEvent();
    await asOrganizer('POST', `/api/events/${event.id}/cancel`, {});
    const res = await asOrganizer('PATCH', `/api/events/${event.id}`, { venue: 'Outra' });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('EVENT_LOCKED');
  });
});

describe('ciclo de vida: publicar, cancelar e excluir', () => {
  it('não publica sem categoria', async () => {
    const event = await createEvent();
    const res = await asOrganizer('POST', `/api/events/${event.id}/publish`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      code: 'EVENT_HAS_NO_CATEGORIES',
      message: 'Adicione ao menos uma categoria antes de publicar o evento.',
    });
  });

  it('publica com categoria; publicar de novo: 409', async () => {
    const event = await createEvent();
    await addCategory(event.id);
    const res = await asOrganizer('POST', `/api/events/${event.id}/publish`);
    expect(res.json()).toMatchObject({ status: 'PUBLISHED', categoryCount: 1 });
    expect((await asOrganizer('POST', `/api/events/${event.id}/publish`)).json().code).toBe('INVALID_STATUS');
  });

  it('cancela publicado (dados ficam guardados); cancelar de novo: 409', async () => {
    const event = await createEvent();
    await addCategory(event.id);
    await asOrganizer('POST', `/api/events/${event.id}/publish`);
    const res = await asOrganizer('POST', `/api/events/${event.id}/cancel`, { reason: 'Chuva forte, pista interditada' });
    expect(res.json()).toMatchObject({ status: 'CANCELED', categoryCount: 1 });
    expect((await asOrganizer('POST', `/api/events/${event.id}/cancel`, {})).statusCode).toBe(409);
  });

  it('exclui rascunho vazio', async () => {
    const event = await createEvent();
    expect((await asOrganizer('DELETE', `/api/events/${event.id}`)).statusCode).toBe(204);
    expect(await db.event.count()).toBe(0);
  });

  it('NÃO exclui rascunho com categoria nem evento publicado (orienta a cancelar)', async () => {
    const draft = await createEvent();
    await addCategory(draft.id);
    const res = await asOrganizer('DELETE', `/api/events/${draft.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain('Cancelar evento');
    expect(await db.event.count()).toBe(1);
    expect(await db.eventCategory.count()).toBe(1);
  });
});

describe('permissões (no backend)', () => {
  it('secretaria consulta, mas não altera', async () => {
    const event = await createEvent();
    const asSecretary = await actingAs(app, db, 'SECRETARY');
    expect((await asSecretary('GET', '/api/events')).statusCode).toBe(200);
    expect((await asSecretary('GET', `/api/events/${event.id}`)).statusCode).toBe(200);
    expect((await asSecretary('GET', '/api/championships')).statusCode).toBe(200);
    for (const [method, url] of [
      ['POST', '/api/events'],
      ['PATCH', `/api/events/${event.id}`],
      ['POST', `/api/events/${event.id}/publish`],
      ['POST', `/api/events/${event.id}/cancel`],
      ['DELETE', `/api/events/${event.id}`],
      ['POST', '/api/championships'],
    ] as const) {
      expect((await asSecretary(method, url, {})).statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('cronometrista e piloto não acessam o cadastro de eventos', async () => {
    for (const role of ['TIMEKEEPER', 'PILOT'] as const) {
      const as = await actingAs(app, db, role);
      expect((await as('GET', '/api/events')).statusCode).toBe(403);
    }
  });

  it('sem login: 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/events' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/championships' })).statusCode).toBe(401);
  });
});
