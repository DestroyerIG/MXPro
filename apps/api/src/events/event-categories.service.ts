import { Prisma, type PrismaClient } from '@mxpro/db';
import { type EventCategoryDto, MODALITY_LABELS, addEventCategorySchema, updateEventCategorySchema } from '@mxpro/shared';
import { AppError } from '../errors.ts';
import { byName, editableEvent, existingEvent, fieldError } from './event-guard.ts';
import { hasSavedRules } from './rules.service.ts';

/** Categorias disputadas num evento: modalidade, valor da inscrição (centavos) e vagas. */

const include = {
  category: { select: { id: true, name: true } },
  _count: { select: { heats: true } },
} satisfies Prisma.EventCategoryInclude;
type EventCategoryRow = Prisma.EventCategoryGetPayload<{ include: typeof include }>;

function toDto(ec: EventCategoryRow): EventCategoryDto {
  return {
    id: ec.id,
    eventId: ec.eventId,
    category: ec.category,
    modality: ec.modality,
    entryFeeCents: ec.entryFeeCents,
    maxEntries: ec.maxEntries,
    heatCount: ec._count.heats,
  };
}

const notFound = () => new AppError(404, 'EVENT_CATEGORY_NOT_FOUND', 'Categoria não encontrada neste evento.');

async function findInEvent(db: PrismaClient, eventId: string, id: string): Promise<EventCategoryRow> {
  const ec = await db.eventCategory.findFirst({ where: { id, eventId }, include });
  if (!ec) throw notFound();
  return ec;
}

export async function listEventCategories(db: PrismaClient, eventId: string): Promise<EventCategoryDto[]> {
  await existingEvent(db, eventId);
  const rows = await db.eventCategory.findMany({ where: { eventId }, include });
  return rows.map(toDto).sort(byName((ec) => ec.category.name));
}

export async function addEventCategory(db: PrismaClient, eventId: string, body: unknown): Promise<EventCategoryDto> {
  const input = addEventCategorySchema.parse(body);
  await editableEvent(db, eventId);
  const category = await db.category.findUnique({ where: { id: input.categoryId }, select: { active: true } });
  if (!category) throw fieldError('categoryId', 'Categoria não encontrada.');
  if (!category.active) throw fieldError('categoryId', 'Esta categoria está desativada no catálogo.');

  try {
    return toDto(await db.eventCategory.create({ data: { eventId, ...input }, include }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CATEGORY_ALREADY_IN_EVENT', 'Esta categoria já está no evento.', [
        { field: 'categoryId', message: 'Esta categoria já está no evento.' },
      ]);
    }
    throw err;
  }
}

export async function updateEventCategory(
  db: PrismaClient,
  eventId: string,
  id: string,
  body: unknown,
): Promise<EventCategoryDto> {
  const data = updateEventCategorySchema.parse(body);
  await editableEvent(db, eventId);
  const current = await findInEvent(db, eventId, id);
  // Regras salvas são de uma modalidade: trocar a modalidade deixaria as regras sem sentido.
  if (data.modality && data.modality !== current.modality && (await hasSavedRules(db, id))) {
    throw new AppError(
      409,
      'RULES_EXIST',
      `Esta categoria já tem regras de ${MODALITY_LABELS[current.modality]} salvas. A modalidade não pode mais ser trocada.`,
      [{ field: 'modality', message: 'A categoria já tem regras salvas desta modalidade.' }],
    );
  }
  return toDto(await db.eventCategory.update({ where: { id }, data, include }));
}

/**
 * Tira a categoria do evento. Recusa se ela está em alguma bateria (tirar de lá antes) ou se é a
 * última de um evento publicado (ele ficaria sem ter onde se inscrever).
 */
export async function removeEventCategory(db: PrismaClient, eventId: string, id: string): Promise<void> {
  const event = await editableEvent(db, eventId);
  const ec = await findInEvent(db, eventId, id);
  if (ec._count.heats > 0) {
    throw new AppError(409, 'CATEGORY_IN_HEAT', 'Esta categoria está em baterias. Tire-a das baterias antes de removê-la.');
  }
  if (event.status === 'PUBLISHED' && (await db.eventCategory.count({ where: { eventId } })) === 1) {
    throw new AppError(409, 'LAST_CATEGORY', 'Um evento publicado precisa de ao menos uma categoria.');
  }
  // `heats: { none: {} }` no próprio comando: se alguém incluir a categoria numa bateria no meio, nada é apagado.
  const { count } = await db.eventCategory.deleteMany({ where: { id, eventId, heats: { none: {} } } });
  if (count === 0) {
    throw new AppError(409, 'CATEGORY_IN_HEAT', 'Esta categoria está em baterias. Tire-a das baterias antes de removê-la.');
  }
}
