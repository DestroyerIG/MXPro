import type { PrismaClient } from '@mxpro/db';
import { MOTOCROSS_TEMPLATE } from '@mxpro/rules-engine';
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

async function setup(modality = 'MOTOCROSS') {
  const event = (
    await as('POST', '/api/events', { name: 'Etapa', startDate: '2027-03-13', endDate: '2027-03-13', venue: 'Pista', city: 'Lages', state: 'SC' })
  ).json();
  const category = (await as('POST', '/api/categories', { name: 'MX2' })).json();
  const ec = (await as('POST', `/api/events/${event.id}/categories`, { categoryId: category.id, modality, entryFeeCents: 15000 })).json();
  const url = `/api/events/${event.id}/categories/${ec.id}/rules`;
  return { event, ec, url };
}
/** Simula a largada de uma bateria com a categoria (a cronometragem fará isso na fase 5). */
async function startHeat(eventId: string, ecId: string) {
  const heat = (await as('POST', `/api/events/${eventId}/heats`, { name: 'Bateria 1', eventCategoryIds: [ecId] })).json();
  await db.heat.update({ where: { id: heat.id }, data: { status: 'IN_PROGRESS' } });
}

const custom = { ...MOTOCROSS_TEMPLATE, minLapMs: 50_000, points: [20, 17, 15] };

describe('GET …/rules', () => {
  it('sem nada salvo: devolve o modelo pronto da modalidade, marcado como não salvo', async () => {
    const { url } = await setup();
    const res = await as('GET', url);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ supported: true, saved: false, frozen: false, current: null, history: [], config: MOTOCROSS_TEMPLATE });
  });

  it('modalidade que o motor ainda não cobre: supported=false, sem configuração', async () => {
    const { url } = await setup('CROSS_COUNTRY');
    expect((await as('GET', url)).json()).toMatchObject({ supported: false, config: null, saved: false });
  });

  it('categoria de outro evento pela URL: 404', async () => {
    const a = await setup();
    const other = (await as('POST', '/api/events', { name: 'Outra', startDate: '2027-04-01', endDate: '2027-04-01', venue: 'P', city: 'Lages', state: 'SC' })).json();
    expect((await as('GET', `/api/events/${other.id}/categories/${a.ec.id}/rules`)).statusCode).toBe(404);
  });
});

describe('PUT …/rules antes da largada (rascunho)', () => {
  it('primeira vez cria a versão 1 com quem salvou', async () => {
    const { url } = await setup();
    const res = await as('PUT', url, { config: custom });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ saved: true, frozen: false, config: custom, current: { version: 1, reason: null } });
    expect(res.json().current.createdBy.name).toBe('Usuário de Teste');
  });

  it('salvar de novo ATUALIZA a versão atual (sem acumular histórico de rascunho)', async () => {
    const { url } = await setup();
    await as('PUT', url, { config: custom });
    const res = await as('PUT', url, { config: { ...custom, heatsPerCategory: 3 } });
    expect(res.json().current.version).toBe(1);
    expect(res.json().history).toHaveLength(1);
    expect(res.json().config.heatsPerCategory).toBe(3);
  });

  it('configuração inválida: 400 com mensagens do motor por campo', async () => {
    const { url } = await setup();
    const res = await as('PUT', url, { config: { ...custom, points: [10, 20], minLapMs: -1 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual(
      expect.arrayContaining([
        { field: 'points', message: 'Cada posição deve valer o mesmo ou menos que a anterior.' },
        { field: 'minLapMs', message: 'A volta mínima não pode ser negativa.' },
      ]),
    );
  });

  it('modalidade não suportada: 409 com mensagem clara', async () => {
    const { url } = await setup('ENDURO');
    const res = await as('PUT', url, { config: custom });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'MODALITY_NOT_SUPPORTED', message: 'As regras de Enduro ainda não estão disponíveis no sistema.' });
  });
});

describe('PUT …/rules depois da largada (congelada)', () => {
  it('fica congelada; mudar sem motivo é recusado', async () => {
    const { event, ec, url } = await setup();
    await as('PUT', url, { config: custom });
    await startHeat(event.id, ec.id);
    expect((await as('GET', url)).json().frozen).toBe(true);
    const res = await as('PUT', url, { config: { ...custom, minLapMs: 40_000 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual([
      { field: 'reason', message: 'A categoria já largou: informe o motivo da mudança (ao menos 5 caracteres).' },
    ]);
    expect((await as('GET', url)).json().config.minLapMs).toBe(50_000); // nada mudou
  });

  it('com motivo: cria NOVA versão e a anterior fica guardada (auditoria)', async () => {
    const { event, ec, url } = await setup();
    await as('PUT', url, { config: custom });
    await startHeat(event.id, ec.id);
    const res = await as('PUT', url, { config: { ...custom, minLapMs: 40_000 }, reason: 'Pista encurtada pela chuva' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current).toMatchObject({ version: 2, reason: 'Pista encurtada pela chuva' });
    expect(body.history.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    // Antes e depois continuam no banco.
    const versions = await db.raceConfigVersion.findMany({ orderBy: { version: 'asc' } });
    expect(versions.map((v) => (v.config as { minLapMs: number }).minLapMs)).toEqual([50_000, 40_000]);
  });

  it('largou sem nada salvo: a primeira gravação já exige motivo e vira a versão 1', async () => {
    const { event, ec, url } = await setup();
    await startHeat(event.id, ec.id);
    expect((await as('PUT', url, { config: custom })).statusCode).toBe(400);
    expect((await as('PUT', url, { config: custom, reason: 'Ajuste da tabela de pontos' })).json().current.version).toBe(1);
  });
});

describe('modalidade da categoria x regras salvas', () => {
  it('com regras salvas, a modalidade da categoria não pode ser trocada', async () => {
    const { event, ec, url } = await setup();
    await as('PUT', url, { config: custom });
    const res = await as('PATCH', `/api/events/${event.id}/categories/${ec.id}`, { modality: 'SUPERCROSS' });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('RULES_EXIST');
    // Valor e vagas continuam editáveis.
    expect((await as('PATCH', `/api/events/${event.id}/categories/${ec.id}`, { entryFeeCents: 9000 })).statusCode).toBe(200);
  });

  it('sem regras salvas, a troca de modalidade é livre', async () => {
    const { event, ec } = await setup();
    expect((await as('PATCH', `/api/events/${event.id}/categories/${ec.id}`, { modality: 'SUPERCROSS' })).statusCode).toBe(200);
  });
});

describe('permissões e evento congelado', () => {
  it('secretaria lê, mas não salva', async () => {
    const { url } = await setup();
    const asSecretary = await actingAs(app, db, 'SECRETARY');
    expect((await asSecretary('GET', url)).statusCode).toBe(200);
    expect((await asSecretary('PUT', url, { config: custom })).statusCode).toBe(403);
  });

  it('evento cancelado: regras não mudam', async () => {
    const { event, url } = await setup();
    await as('POST', `/api/events/${event.id}/cancel`, {});
    expect((await as('PUT', url, { config: custom })).json().code).toBe('EVENT_LOCKED');
  });
});
