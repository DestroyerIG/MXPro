import type { Prisma, PrismaClient } from '@mxpro/db';
import { type HeatDto, calendarDateIn, createHeatSchema, updateHeatSchema } from '@mxpro/shared';
import { AppError } from '../errors.ts';
import { byName, editableEvent, existingEvent, fieldError } from './event-guard.ts';

/**
 * Baterias (largadas) de um evento. Uma bateria pode juntar categorias na pista; cada piloto é
 * classificado na sua. Nesta fase só baterias PROGRAMADAS são editadas: iniciar e encerrar vêm
 * com a cronometragem (fase 5), e aí os dados de tempo passam a protegê-las.
 */

const include = {
  categories: { include: { eventCategory: { include: { category: { select: { id: true, name: true } } } } } },
} satisfies Prisma.HeatInclude;
type HeatRow = Prisma.HeatGetPayload<{ include: typeof include }>;

function toDto(h: HeatRow): HeatDto {
  return {
    id: h.id,
    eventId: h.eventId,
    name: h.name,
    scheduledAt: h.scheduledAt?.toISOString() ?? null,
    status: h.status,
    categories: h.categories
      .map((hc) => ({
        eventCategoryId: hc.eventCategoryId,
        categoryId: hc.eventCategory.category.id,
        name: hc.eventCategory.category.name,
      }))
      .sort(byName((c) => c.name)),
  };
}

const notFound = () => new AppError(404, 'HEAT_NOT_FOUND', 'Bateria não encontrada neste evento.');
const fromDate = (d: Date) => d.toISOString().slice(0, 10);
const toBr = (calendarDate: string) => calendarDate.split('-').reverse().join('/');

type EventForHeats = Awaited<ReturnType<typeof editableEvent>>;

/** O horário precisa cair num dos dias do evento, NO FUSO DO EVENTO (22h de sábado em SP não é domingo). */
function assertWithinEventDates(event: EventForHeats, scheduledAt: string | null): void {
  if (!scheduledAt) return;
  const day = calendarDateIn(new Date(scheduledAt), event.timeZone);
  const start = fromDate(event.startDate);
  const end = fromDate(event.endDate);
  if (day < start || day > end) {
    const period = start === end ? `no dia ${toBr(start)}` : `entre ${toBr(start)} e ${toBr(end)}`;
    throw fieldError('scheduledAt', `O horário precisa ser ${period}, nas datas do evento.`);
  }
}

/** Todas as categorias escolhidas precisam ser DESTE evento (o banco também garante, com FK composta). */
async function assertCategoriesInEvent(db: PrismaClient, eventId: string, ids: string[]): Promise<void> {
  const found = await db.eventCategory.count({ where: { eventId, id: { in: ids } } });
  if (found !== ids.length) throw fieldError('eventCategoryIds', 'Escolha só categorias deste evento.');
}

export async function listHeats(db: PrismaClient, eventId: string): Promise<HeatDto[]> {
  await existingEvent(db, eventId);
  const rows = await db.heat.findMany({
    where: { eventId },
    include,
    // Programação: por horário; "a definir" no fim.
    orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
  });
  return rows.map(toDto);
}

export async function createHeat(db: PrismaClient, eventId: string, body: unknown): Promise<HeatDto> {
  const input = createHeatSchema.parse(body);
  const event = await editableEvent(db, eventId);
  assertWithinEventDates(event, input.scheduledAt);
  await assertCategoriesInEvent(db, eventId, input.eventCategoryIds);

  const heat = await db.heat.create({
    data: {
      eventId,
      name: input.name,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      categories: { create: input.eventCategoryIds.map((eventCategoryId) => ({ eventCategoryId })) },
    },
    include,
  });
  return toDto(heat);
}

async function scheduledHeat(db: PrismaClient, eventId: string, id: string) {
  const heat = await db.heat.findFirst({ where: { id, eventId }, select: { status: true } });
  if (!heat) throw notFound();
  if (heat.status !== 'SCHEDULED') {
    throw new AppError(409, 'HEAT_LOCKED', 'Só uma bateria programada (ainda não iniciada) pode ser alterada.');
  }
}

export async function updateHeat(db: PrismaClient, eventId: string, id: string, body: unknown): Promise<HeatDto> {
  const patch = updateHeatSchema.parse(body);
  const event = await editableEvent(db, eventId);
  await scheduledHeat(db, eventId, id);
  if (patch.scheduledAt !== undefined) assertWithinEventDates(event, patch.scheduledAt);
  if (patch.eventCategoryIds) await assertCategoriesInEvent(db, eventId, patch.eventCategoryIds);

  // Transação: trocar as categorias é apagar e recriar as ligações; ou tudo acontece, ou nada.
  const heat = await db.$transaction(async (tx) => {
    if (patch.eventCategoryIds) {
      await tx.heatCategory.deleteMany({ where: { heatId: id } });
      await tx.heatCategory.createMany({
        data: patch.eventCategoryIds.map((eventCategoryId) => ({ heatId: id, eventId, eventCategoryId })),
      });
    }
    return tx.heat.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : null } : {}),
      },
      include,
    });
  });
  return toDto(heat);
}

export async function deleteHeat(db: PrismaClient, eventId: string, id: string): Promise<void> {
  await editableEvent(db, eventId);
  await scheduledHeat(db, eventId, id);
  await db.heat.deleteMany({ where: { id, eventId, status: 'SCHEDULED' } });
}
