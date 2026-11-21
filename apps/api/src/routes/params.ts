import { z } from 'zod';
import { AppError } from '../errors.ts';

const params = z.object({ id: z.uuid() });

/**
 * Lê o `:id` da URL. Id malformado responde 404 (o recurso "não existe"), em vez de um erro de
 * banco ao comparar texto com coluna UUID.
 */
export function idParam(raw: unknown, code: string, message: string): string {
  const parsed = params.safeParse(raw);
  if (!parsed.success) throw new AppError(404, code, message);
  return parsed.data.id;
}
