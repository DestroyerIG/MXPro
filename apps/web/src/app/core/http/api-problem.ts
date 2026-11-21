import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorBody } from '@mxpro/shared';

/** Erro da API já separado: mensagem geral e mensagens por campo (`details`). */
export interface ApiProblem {
  message: string;
  fields: Record<string, string>;
}

/** Converte qualquer falha de chamada numa mensagem para a tela (a API já responde em português). */
export function toApiProblem(err: unknown): ApiProblem {
  if (!(err instanceof HttpErrorResponse)) return { message: 'Algo deu errado. Tente de novo.', fields: {} };
  if (err.status === 0) return { message: 'Sem conexão com o servidor. Verifique a internet e tente de novo.', fields: {} };
  const body = err.error as Partial<ApiErrorBody> | null;
  const details = Array.isArray(body?.details) ? (body.details as { field?: unknown; message?: unknown }[]) : [];
  const fields: Record<string, string> = {};
  for (const d of details) {
    if (typeof d.field === 'string' && typeof d.message === 'string' && !(d.field in fields)) fields[d.field] = d.message;
  }
  const message =
    err.status < 500 && typeof body?.message === 'string' ? body.message : 'Não foi possível concluir agora. Tente de novo em instantes.';
  return { message, fields };
}
