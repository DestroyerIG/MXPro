import type { PrismaClient } from '@mxpro/db';
import { AppError } from '../errors.ts';

const select = { id: true, status: true, startDate: true, endDate: true, timeZone: true } as const;

/** Evento que existe (404 se não). */
export async function existingEvent(db: PrismaClient, eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select });
  if (!event) throw new AppError(404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
  return event;
}

/** Evento que ainda pode ser alterado: encerrado ou cancelado fica congelado (409). */
export async function editableEvent(db: PrismaClient, eventId: string) {
  const event = await existingEvent(db, eventId);
  if (event.status === 'CANCELED' || event.status === 'FINISHED') {
    throw new AppError(409, 'EVENT_LOCKED', 'Evento encerrado ou cancelado não pode ser alterado.');
  }
  return event;
}

/** Erro de validação apontando um campo (mesmo formato dos erros do Zod). */
export function fieldError(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Dados inválidos. Confira os campos destacados.', [{ field, message }]);
}

/**
 * Ordem alfabética "de gente": ignora maiúsculas/acentos e entende números (65cc antes de 125cc).
 * O ORDER BY do Postgres segue a collation do banco ("MX2" antes de "Master"), por isso ordenamos aqui.
 */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
export const byName = <T>(name: (item: T) => string) => (a: T, b: T) => collator.compare(name(a), name(b));
