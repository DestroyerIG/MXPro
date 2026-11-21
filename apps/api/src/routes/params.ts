import { z } from 'zod';
import { AppError } from '../errors.ts';

/**
 * Lê um id da URL (`:id`, `:categoryId`…). Id malformado responde 404 (o recurso "não existe"),
 * em vez de um erro de banco ao comparar texto com coluna UUID.
 */
export function idParam(raw: unknown, code: string, message: string, key = 'id'): string {
  const parsed = z.object({ [key]: z.uuid() }).safeParse(raw);
  if (!parsed.success) throw new AppError(404, code, message);
  return parsed.data[key] as string;
}
