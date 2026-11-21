import { Prisma, type PrismaClient } from '@mxpro/db';
import {
  type EventDto,
  type EventInput,
  updateEventSchema,
  createEventSchema,
  eventSchema,
  isRegistrationOpen,
} from '@mxpro/shared';
import { AppError } from '../errors.ts';

/**
 * Regras de negócio de eventos (etapas). As rotas só validam o formato e chamam estas funções.
 * O relógio (`now`) entra como parâmetro: o mesmo código é testável em qualquer data.
 *
 * Ciclo de vida: DRAFT → PUBLISHED → FINISHED; DRAFT/PUBLISHED → CANCELED.
 * Evento com dados vinculados é cancelado, nunca apagado (só rascunho vazio pode ser excluído).
 */

const include = {
  championship: { select: { id: true, name: true, season: true } },
  _count: { select: { categories: true, heats: true } },
} satisfies Prisma.EventInclude;
type EventRow = Prisma.EventGetPayload<{ include: typeof include }>;

/** "AAAA-MM-DD" ↔ coluna DATE (meia-noite UTC no Prisma). */
const toDate = (calendarDate: string) => new Date(`${calendarDate}T00:00:00Z`);
const fromDate = (d: Date) => d.toISOString().slice(0, 10);
const toInstant = (iso: string | null) => (iso ? new Date(iso) : null);

export function toEventDto(e: EventRow, now: Date): EventDto {
  return {
    id: e.id,
    name: e.name,
    championship: e.championship,
    stageNumber: e.stageNumber,
    startDate: fromDate(e.startDate),
    endDate: fromDate(e.endDate),
    timeZone: e.timeZone,
    venue: e.venue,
    city: e.city,
    state: e.state,
    status: e.status,
    registration: {
      opensAt: e.registrationOpensAt?.toISOString() ?? null,
      closesAt: e.registrationClosesAt?.toISOString() ?? null,
      closedEarly: e.registrationClosedEarly,
      isOpen: isRegistrationOpen(e, now),
    },
    categoryCount: e._count.categories,
    heatCount: e._count.heats,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** Converte a entrada validada nas colunas do banco. */
function toColumns(input: EventInput) {
  return {
    name: input.name,
    championshipId: input.championshipId,
    stageNumber: input.stageNumber,
    startDate: toDate(input.startDate),
    endDate: toDate(input.endDate),
    timeZone: input.timeZone,
    venue: input.venue,
    city: input.city,
    state: input.state,
    registrationOpensAt: toInstant(input.registrationOpensAt),
    registrationClosesAt: toInstant(input.registrationClosesAt),
    registrationClosedEarly: input.registrationClosedEarly,
  };
}

/** Linha do banco → mesmos campos da entrada (base para aplicar uma edição parcial). */
function toInput(e: EventRow): EventInput {
  return {
    name: e.name,
    championshipId: e.championshipId,
    stageNumber: e.stageNumber,
    startDate: fromDate(e.startDate),
    endDate: fromDate(e.endDate),
    timeZone: e.timeZone,
    venue: e.venue,
    city: e.city,
    state: e.state as EventInput['state'],
    registrationOpensAt: e.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: e.registrationClosesAt?.toISOString() ?? null,
    registrationClosedEarly: e.registrationClosedEarly,
  };
}

const notFound = () => new AppError(404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');

async function findOrFail(db: PrismaClient, id: string): Promise<EventRow> {
  const event = await db.event.findUnique({ where: { id }, include });
  if (!event) throw notFound();
  return event;
}

async function assertChampionshipExists(db: PrismaClient, championshipId: string | null): Promise<void> {
  if (!championshipId) return;
  const exists = await db.championship.count({ where: { id: championshipId } });
  if (!exists) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dados inválidos. Confira os campos destacados.', [
      { field: 'championshipId', message: 'Campeonato não encontrado.' },
    ]);
  }
}

/** Etapa repetida no mesmo campeonato vira uma mensagem clara (o banco é quem garante a unicidade). */
async function withStageConflict<T>(stageNumber: number | null, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'STAGE_TAKEN', `Este campeonato já tem a etapa ${stageNumber}.`, [
        { field: 'stageNumber', message: `A etapa ${stageNumber} já existe neste campeonato.` },
      ]);
    }
    throw err;
  }
}

export async function listEvents(
  db: PrismaClient,
  filters: { status?: EventDto['status']; championshipId?: string },
  now: Date,
): Promise<EventDto[]> {
  const rows = await db.event.findMany({
    where: { status: filters.status, championshipId: filters.championshipId },
    include,
    orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
  });
  return rows.map((e) => toEventDto(e, now));
}

export async function getEvent(db: PrismaClient, id: string, now: Date): Promise<EventDto> {
  return toEventDto(await findOrFail(db, id), now);
}

export async function createEvent(db: PrismaClient, body: unknown, now: Date): Promise<EventDto> {
  const input = createEventSchema.parse(body);
  await assertChampionshipExists(db, input.championshipId);
  const created = await withStageConflict(input.stageNumber, () =>
    db.event.create({ data: { ...toColumns(input), status: 'DRAFT' }, include }),
  );
  return toEventDto(created, now);
}

/** Edição parcial: aplica os campos enviados sobre o atual e valida o RESULTADO inteiro. */
export async function updateEvent(db: PrismaClient, id: string, body: unknown, now: Date): Promise<EventDto> {
  const patch = updateEventSchema.parse(body);
  const current = await findOrFail(db, id);
  if (current.status === 'CANCELED' || current.status === 'FINISHED') {
    throw new AppError(409, 'EVENT_LOCKED', 'Evento encerrado ou cancelado não pode ser alterado.');
  }
  const raw = { ...toInput(current), ...patch };
  // Ao sair do campeonato, a etapa deixa de existir (senão a validação acusaria "etapa sem campeonato").
  if (patch.championshipId === null && patch.stageNumber === undefined) raw.stageNumber = null;
  const merged = eventSchema.parse(raw);
  if (patch.championshipId !== undefined) await assertChampionshipExists(db, merged.championshipId);

  const updated = await withStageConflict(merged.stageNumber, () =>
    db.event.update({ where: { id }, data: toColumns(merged), include }),
  );
  return toEventDto(updated, now);
}

/** Publica: o evento passa a aparecer para pilotos e público. Exige ao menos uma categoria. */
export async function publishEvent(db: PrismaClient, id: string, now: Date): Promise<EventDto> {
  const event = await findOrFail(db, id);
  if (event.status !== 'DRAFT') {
    throw new AppError(409, 'INVALID_STATUS', 'Só um evento em rascunho pode ser publicado.');
  }
  if (event._count.categories === 0) {
    throw new AppError(409, 'EVENT_HAS_NO_CATEGORIES', 'Adicione ao menos uma categoria antes de publicar o evento.');
  }
  // `status: 'DRAFT'` no where: se duas pessoas publicarem ao mesmo tempo, só uma muda o status.
  const { count } = await db.event.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'PUBLISHED' } });
  if (count === 0) throw new AppError(409, 'INVALID_STATUS', 'O evento mudou de status. Atualize a página.');
  return getEvent(db, id, now);
}

/** Cancela (rascunho ou publicado). Os dados ficam guardados; nada é apagado. */
export async function cancelEvent(db: PrismaClient, id: string, now: Date): Promise<EventDto> {
  const event = await findOrFail(db, id);
  if (event.status !== 'DRAFT' && event.status !== 'PUBLISHED') {
    throw new AppError(409, 'INVALID_STATUS', 'Este evento já está encerrado ou cancelado.');
  }
  await db.event.updateMany({ where: { id, status: { in: ['DRAFT', 'PUBLISHED'] } }, data: { status: 'CANCELED' } });
  return getEvent(db, id, now);
}

/** Exclui de vez: só rascunho sem categorias nem baterias (o resto é cancelado). */
export async function deleteEvent(db: PrismaClient, id: string): Promise<void> {
  await findOrFail(db, id); // 404 se não existir
  // Condição e exclusão num comando só: se alguém adicionar uma categoria no meio, nada é apagado.
  const { count } = await db.event.deleteMany({
    where: { id, status: 'DRAFT', categories: { none: {} }, heats: { none: {} } },
  });
  if (count === 0) {
    throw new AppError(
      409,
      'EVENT_NOT_DELETABLE',
      'Só um rascunho sem categorias nem baterias pode ser excluído. Para os demais, use "Cancelar evento".',
    );
  }
}
