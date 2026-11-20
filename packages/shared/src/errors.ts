/** Corpo de toda resposta de erro da API (docs/arquitetura.md §6). */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** Códigos de erro conhecidos que o front pode tratar de forma específica. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_INACTIVE: 'USER_INACTIVE',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  CSRF_ORIGIN: 'CSRF_ORIGIN',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
