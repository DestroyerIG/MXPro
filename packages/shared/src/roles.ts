/**
 * Perfis de acesso SEM depender do Zod: o front importa daqui sem levar a biblioteca de
 * validação para o bundle (mesma ideia de `branding-defaults.ts`).
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
