/**
 * Seed de eventos (fase 2) com os dados FICTÍCIOS do escopo (PDF, página 3):
 * "Copa Verão de Motocross" 2027, Etapa 2 publicada com 6 categorias e 6 baterias, Etapa 3 em rascunho.
 *
 * Ids fixos: rodar de novo atualiza as mesmas linhas (upsert) em vez de duplicar.
 */
import { MOTOCROSS_TEMPLATE } from '@mxpro/rules-engine';
import type { Modality, PrismaClient } from '../src/index.ts';

const CHAMPIONSHIP_ID = '019a8f00-0000-7000-8000-000000000001';
const STAGE_2_ID = '019a8f00-0000-7000-8000-000000000102';
const STAGE_3_ID = '019a8f00-0000-7000-8000-000000000103';

/** Catálogo: [id, nome]. */
const CATEGORIES = [
  ['019a8f00-0000-7000-8000-000000000201', 'MX1'],
  ['019a8f00-0000-7000-8000-000000000202', 'MX2'],
  ['019a8f00-0000-7000-8000-000000000203', 'Feminino'],
  ['019a8f00-0000-7000-8000-000000000204', 'Master 35+'],
  ['019a8f00-0000-7000-8000-000000000205', '65cc'],
  ['019a8f00-0000-7000-8000-000000000206', 'Cross Country'],
] as const;
type CategoryName = (typeof CATEGORIES)[number][1];

/** Categorias da Etapa 2: modalidade, valor (centavos) e vagas. */
const STAGE_2_CATEGORIES: Record<CategoryName, { id: string; modality: Modality; entryFeeCents: number; maxEntries: number | null }> = {
  MX1: { id: '019a8f00-0000-7000-8000-000000000301', modality: 'MOTOCROSS', entryFeeCents: 15000, maxEntries: 40 },
  MX2: { id: '019a8f00-0000-7000-8000-000000000302', modality: 'MOTOCROSS', entryFeeCents: 15000, maxEntries: 40 },
  Feminino: { id: '019a8f00-0000-7000-8000-000000000303', modality: 'MOTOCROSS', entryFeeCents: 10000, maxEntries: null },
  'Master 35+': { id: '019a8f00-0000-7000-8000-000000000304', modality: 'MOTOCROSS', entryFeeCents: 15000, maxEntries: 40 },
  '65cc': { id: '019a8f00-0000-7000-8000-000000000305', modality: 'MOTOCROSS', entryFeeCents: 8000, maxEntries: 30 },
  'Cross Country': { id: '019a8f00-0000-7000-8000-000000000306', modality: 'CROSS_COUNTRY', entryFeeCents: 12000, maxEntries: null },
};

/** Programação da Etapa 2 (horários em UTC: 12:00Z = 09:00 em São Paulo). */
const STAGE_2_HEATS: { id: string; name: string; scheduledAt: string; categories: CategoryName[] }[] = [
  { id: '019a8f00-0000-7000-8000-000000000401', name: 'Bateria 1', scheduledAt: '2027-03-13T12:00:00Z', categories: ['MX1'] },
  { id: '019a8f00-0000-7000-8000-000000000402', name: 'Bateria 1', scheduledAt: '2027-03-13T12:40:00Z', categories: ['MX2'] },
  { id: '019a8f00-0000-7000-8000-000000000403', name: 'Única', scheduledAt: '2027-03-13T13:20:00Z', categories: ['Feminino'] },
  { id: '019a8f00-0000-7000-8000-000000000404', name: 'Bateria 1', scheduledAt: '2027-03-13T14:00:00Z', categories: ['Master 35+'] },
  { id: '019a8f00-0000-7000-8000-000000000405', name: 'Bateria 1', scheduledAt: '2027-03-13T14:40:00Z', categories: ['65cc'] },
  { id: '019a8f00-0000-7000-8000-000000000406', name: 'Bateria 2', scheduledAt: '2027-03-13T16:00:00Z', categories: ['MX1'] },
];

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function seedEvents(prisma: PrismaClient): Promise<void> {
  await prisma.championship.upsert({
    where: { id: CHAMPIONSHIP_ID },
    create: { id: CHAMPIONSHIP_ID, name: 'Copa Verão de Motocross', season: 2027 },
    update: { name: 'Copa Verão de Motocross', season: 2027 },
  });

  for (const [id, name] of CATEGORIES) {
    await prisma.category.upsert({ where: { id }, create: { id, name }, update: { name, active: true } });
  }

  const stage2 = {
    championshipId: CHAMPIONSHIP_ID,
    stageNumber: 2,
    name: 'Copa Verão de Motocross - Etapa 2',
    startDate: date('2027-03-13'),
    endDate: date('2027-03-13'),
    venue: 'Pista Terra Vermelha',
    city: 'Campo Largo',
    state: 'PR',
    status: 'PUBLISHED' as const,
    // O PDF não fixa a abertura; aqui já abriu, para dar para testar a inscrição em desenvolvimento.
    registrationOpensAt: new Date('2026-11-01T12:00:00Z'),
    registrationClosesAt: new Date('2027-03-11T02:59:00Z'), // 10/03 23:59 em São Paulo
  };
  await prisma.event.upsert({ where: { id: STAGE_2_ID }, create: { id: STAGE_2_ID, ...stage2 }, update: stage2 });

  const stage3 = {
    championshipId: CHAMPIONSHIP_ID,
    stageNumber: 3,
    name: 'Copa Verão de Motocross - Etapa 3',
    startDate: date('2027-04-17'),
    endDate: date('2027-04-18'),
    venue: 'Arena Serra Azul',
    city: 'Lages',
    state: 'SC',
    status: 'DRAFT' as const,
  };
  await prisma.event.upsert({ where: { id: STAGE_3_ID }, create: { id: STAGE_3_ID, ...stage3 }, update: stage3 });

  const categoryIdByName = new Map<string, string>(CATEGORIES.map(([id, name]) => [name, id]));
  for (const [name, ec] of Object.entries(STAGE_2_CATEGORIES)) {
    const data = { modality: ec.modality, entryFeeCents: ec.entryFeeCents, maxEntries: ec.maxEntries };
    await prisma.eventCategory.upsert({
      where: { id: ec.id },
      create: { id: ec.id, eventId: STAGE_2_ID, categoryId: categoryIdByName.get(name)!, ...data },
      update: data,
    });
    // Regras da prova: categorias de Motocross partem do modelo pronto (versão 1). Cross Country
    // ainda não tem regras no motor. `update: {}` não sobrescreve ajustes feitos pela tela.
    if (ec.modality === 'MOTOCROSS') {
      await prisma.raceConfigVersion.upsert({
        where: { eventCategoryId_version: { eventCategoryId: ec.id, version: 1 } },
        create: { eventCategoryId: ec.id, version: 1, config: structuredClone(MOTOCROSS_TEMPLATE) as unknown as object },
        update: {},
      });
    }
  }

  for (const heat of STAGE_2_HEATS) {
    const data = { name: heat.name, scheduledAt: new Date(heat.scheduledAt) };
    await prisma.heat.upsert({ where: { id: heat.id }, create: { id: heat.id, eventId: STAGE_2_ID, ...data }, update: data });
    for (const category of heat.categories) {
      const eventCategoryId = STAGE_2_CATEGORIES[category].id;
      await prisma.heatCategory.upsert({
        where: { heatId_eventCategoryId: { heatId: heat.id, eventCategoryId } },
        create: { heatId: heat.id, eventCategoryId, eventId: STAGE_2_ID },
        update: {},
      });
    }
  }
}
