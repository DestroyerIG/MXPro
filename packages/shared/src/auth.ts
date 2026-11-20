import { z } from 'zod';

/**
 * Contratos de autenticação usados pela API (validação) e pelo front (formulário e tipos).
 * Um só lugar: se a regra mudar, os dois lados mudam juntos.
 */

/** Perfis de acesso (docs/arquitetura.md §1). */
export const ROLES = ['ORGANIZER', 'SECRETARY', 'TIMEKEEPER', 'PILOT'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ORGANIZER: 'Organizador',
  SECRETARY: 'Secretaria',
  TIMEKEEPER: 'Cronometrista',
  PILOT: 'Piloto',
};

export const loginRequestSchema = z.object({
  email: z
    .string('Informe o e-mail.')
    .trim()
    .toLowerCase()
    .pipe(z.email('Informe um e-mail válido.').max(254)),
  // Sem regra de complexidade aqui: o login só confere. Limite evita hash de textos gigantes (DoS).
  password: z.string('Informe a senha.').min(1, 'Informe a senha.').max(200, 'Senha longa demais.'),
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const sessionUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum(ROLES),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** Resposta de POST /api/auth/login e GET /api/auth/me. */
export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
  /** ISO 8601 (UTC). */
  expiresAt: z.iso.datetime(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
