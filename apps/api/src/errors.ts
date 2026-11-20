import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** Corpo de TODA resposta de erro da API (docs/arquitetura.md §6). */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Erro de negócio esperado. Lançado por services/rotas e convertido em resposta pelo handler.
 * `message` é mostrada ao usuário: sempre em pt-BR, dizendo o que aconteceu e como resolver.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Registra o tratamento padronizado de erros e de rota inexistente. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: `Rota não encontrada: ${request.method} ${request.url}`,
    } satisfies ApiErrorBody);
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      } satisfies ApiErrorBody);
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos. Confira os campos destacados.',
        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      } satisfies ApiErrorBody);
    }

    // Erros do próprio Fastify com status 4xx (ex.: JSON malformado, corpo grande demais).
    const status = 'statusCode' in error ? error.statusCode : undefined;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({
        code: status === 429 ? 'RATE_LIMITED' : 'BAD_REQUEST',
        message:
          status === 429 ? 'Muitas tentativas. Aguarde um pouco e tente de novo.' : 'Requisição inválida.',
      } satisfies ApiErrorBody);
    }

    // Inesperado: registra tudo no log, mas NÃO vaza detalhes (stack, SQL) para o cliente.
    request.log.error({ err: error }, 'erro inesperado');
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Erro inesperado no servidor. Tente novamente em instantes.',
    } satisfies ApiErrorBody);
  });
}
