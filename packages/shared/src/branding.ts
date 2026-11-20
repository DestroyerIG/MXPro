import { z } from 'zod';

/**
 * Identidade visual do contratante (docs/arquitetura.md §2.7): aplicada em telas públicas, telão e PDFs.
 * Qualquer cor #RRGGBB é aceita: o front deriva os tons de texto/fundo garantindo contraste AA.
 */

import { type Branding, PUBLIC_NAME_DISPLAY } from './branding-defaults.js';

export * from './branding-defaults.js';

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** O que a API devolve em GET /api/settings/branding (público, sem login). */
export const brandingSchema: z.ZodType<Branding> = z.object({
  brandName: z.string(),
  brandNameAccent: z.string().nullable(),
  primaryColor: z.string().regex(HEX_COLOR),
  logoUrl: z.string().nullable(),
  publicNameDisplay: z.enum(PUBLIC_NAME_DISPLAY),
});

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Corpo de PUT /api/settings/branding (somente organizador). */
export const updateBrandingSchema = z
  .object({
    brandName: z
      .string('Informe o nome.')
      .trim()
      .min(1, 'Informe o nome.')
      .max(40, 'Use no máximo 40 caracteres.'),
    brandNameAccent: z.preprocess(
      emptyToNull,
      z.string().trim().max(20, 'Use no máximo 20 caracteres.').nullable().default(null),
    ),
    primaryColor: z.string('Informe a cor.').regex(HEX_COLOR, 'Use uma cor no formato #RRGGBB, ex.: #E8590C.'),
    // Só https: logo em http seria bloqueado como "conteúdo misto" na página segura.
    logoUrl: z.preprocess(
      emptyToNull,
      z.url({ protocol: /^https$/, message: 'Use um endereço que comece com https://.' }).nullable().default(null),
    ),
    publicNameDisplay: z.enum(PUBLIC_NAME_DISPLAY).default('FULL_NAME'),
  })
  // Sem nome, o erro já é "Informe o nome."; não acumular um segundo erro derivado dele.
  .refine((b) => !b.brandNameAccent || !b.brandName || b.brandName.startsWith(b.brandNameAccent), {
    path: ['brandNameAccent'],
    message: 'O destaque precisa ser o começo do nome (ex.: "MX" em "MXPRO").',
  });
export type UpdateBrandingRequest = z.input<typeof updateBrandingSchema>;
