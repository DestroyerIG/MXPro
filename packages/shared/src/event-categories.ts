import { z } from 'zod';
import { MODALITIES } from './events-defaults.js';

/**
 * Validação do catálogo de categorias, das categorias de um evento e das baterias.
 * Dinheiro sempre em centavos inteiros (docs/arquitetura.md §2.6).
 */

const MAX_FEE_CENTS = 10_000_000; // R$ 100.000,00: acima disso é quase certamente erro de digitação

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const categoryInputSchema = z.object({
  name: z.string('Informe o nome.').trim().min(1, 'Informe o nome.').max(40, 'Use no máximo 40 caracteres.'),
  description: z.preprocess(emptyToNull, z.string().trim().max(200, 'Use no máximo 200 caracteres.').nullable().default(null)),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export const updateCategorySchema = z
  .strictObject({
    name: categoryInputSchema.shape.name,
    description: z.preprocess(emptyToNull, z.string().trim().max(200, 'Use no máximo 200 caracteres.').nullable()),
    active: z.boolean(),
  })
  .partial();

const eventCategoryFields = {
  modality: z.enum(MODALITIES, 'Escolha a modalidade.'),
  entryFeeCents: z
    .number('Informe o valor da inscrição.')
    .int('Informe o valor em centavos (número inteiro).')
    .min(0, 'O valor não pode ser negativo.')
    .max(MAX_FEE_CENTS, 'Valor alto demais. Confira o valor (em centavos).'),
  maxEntries: z
    .number('Informe o limite de vagas.')
    .int('Use um número inteiro.')
    .min(1, 'Use 1 ou mais (ou deixe sem limite).')
    .max(10_000, 'Use até 10.000.')
    .nullable(),
};

/** Corpo de POST /api/events/:id/categories. */
export const addEventCategorySchema = z.object({
  categoryId: z.uuid('Escolha a categoria.'),
  ...eventCategoryFields,
  maxEntries: eventCategoryFields.maxEntries.default(null),
});
export type AddEventCategoryRequest = z.input<typeof addEventCategorySchema>;

/** Corpo de PATCH /api/events/:id/categories/:eventCategoryId (a categoria em si não muda). */
export const updateEventCategorySchema = z.strictObject(eventCategoryFields).partial();
export type UpdateEventCategoryRequest = z.input<typeof updateEventCategorySchema>;

const heatFields = {
  name: z.string('Informe o nome da bateria.').trim().min(1, 'Informe o nome da bateria.').max(40, 'Use no máximo 40 caracteres.'),
  scheduledAt: z.iso
    .datetime({ offset: true, message: 'Use data e hora no formato ISO 8601 (ex.: 2027-03-13T09:00:00-03:00).' })
    .nullable(),
  eventCategoryIds: z
    .array(z.uuid('Categoria inválida.'), 'Escolha as categorias da bateria.')
    .min(1, 'Escolha ao menos uma categoria.')
    .max(20, 'Use no máximo 20 categorias.')
    .refine((ids) => new Set(ids).size === ids.length, 'A mesma categoria foi escolhida duas vezes.'),
};

/** Corpo de POST /api/events/:id/heats. */
export const createHeatSchema = z.object({ ...heatFields, scheduledAt: heatFields.scheduledAt.default(null) });
export type CreateHeatRequest = z.input<typeof createHeatSchema>;

/** Corpo de PATCH /api/events/:id/heats/:heatId. */
export const updateHeatSchema = z.strictObject(heatFields).partial();
export type UpdateHeatRequest = z.input<typeof updateHeatSchema>;

