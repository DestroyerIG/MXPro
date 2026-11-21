import { z } from 'zod';
import { RACE_NUMBER_PATTERN } from './registrations-defaults.js';

export * from './registrations-defaults.js';

/**
 * Validação da inscrição (formulário público). O piloto informa só o que o escopo pede: nome,
 * nº de largada, categoria, moto, equipe e o aceite do termo (LGPD: coletar o mínimo).
 */

/** Conta criada na primeira inscrição (quem já tem conta entra antes e não manda este bloco). */
export const pilotAccountSchema = z.object({
  name: z
    .string('Informe o nome completo.')
    .trim()
    .max(120, 'Use no máximo 120 caracteres.')
    .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, 'Informe o nome completo (nome e sobrenome).'),
  email: z
    .string('Informe o e-mail.')
    .trim()
    .toLowerCase()
    .pipe(z.email('Informe um e-mail válido.').max(254, 'E-mail longo demais.')),
  password: z
    .string('Crie uma senha.')
    .min(8, 'Use pelo menos 8 caracteres na senha.')
    .max(200, 'Senha longa demais.'),
  acceptPrivacy: z.literal(true, 'Aceite a política de privacidade para criar a conta.'),
});
export type PilotAccountInput = z.input<typeof pilotAccountSchema>;

export const createRegistrationSchema = z.object({
  eventCategoryId: z.uuid('Escolha a categoria.'),
  raceNumber: z
    .string('Informe o número de largada.')
    .trim()
    .regex(RACE_NUMBER_PATTERN, 'Use de 1 a 3 dígitos (ex.: 27 ou 05).'),
  bike: z
    .string('Informe a moto.')
    .trim()
    .min(2, 'Informe a moto (ex.: Honda CRF 250F).')
    .max(60, 'Use no máximo 60 caracteres.'),
  team: z
    .string()
    .trim()
    .max(60, 'Use no máximo 60 caracteres.')
    .optional()
    .transform((v) => (v ? v : null)),
  acceptWaiver: z.literal(true, 'Aceite o termo de responsabilidade para continuar.'),
  account: pilotAccountSchema.optional(),
});
export type CreateRegistrationRequest = z.input<typeof createRegistrationSchema>;
