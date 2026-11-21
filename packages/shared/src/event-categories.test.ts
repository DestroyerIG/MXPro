import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  addEventCategorySchema,
  categoryInputSchema,
  createHeatSchema,
  updateEventCategorySchema,
  updateHeatSchema,
} from './event-categories.js';
import { calendarDateIn } from './events-defaults.js';

function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}
const ID = '019a8f00-0000-7000-8000-000000000301';
const ID2 = '019a8f00-0000-7000-8000-000000000302';

describe('categoryInputSchema', () => {
  it('nome obrigatório; descrição vazia vira null', () => {
    expect(categoryInputSchema.parse({ name: ' MX2 ', description: '  ' })).toEqual({ name: 'MX2', description: null });
    expect(errorsOf(categoryInputSchema, { name: '  ' })).toEqual({ name: 'Informe o nome.' });
  });
});

describe('addEventCategorySchema', () => {
  it('valor em centavos e vagas opcionais (null = sem limite)', () => {
    expect(addEventCategorySchema.parse({ categoryId: ID, modality: 'MOTOCROSS', entryFeeCents: 15000 })).toEqual({
      categoryId: ID, modality: 'MOTOCROSS', entryFeeCents: 15000, maxEntries: null,
    });
  });

  it.each([
    [{ entryFeeCents: 150.5 }, 'entryFeeCents', 'Informe o valor em centavos (número inteiro).'],
    [{ entryFeeCents: -1 }, 'entryFeeCents', 'O valor não pode ser negativo.'],
    [{ entryFeeCents: 10_000_001 }, 'entryFeeCents', 'Valor alto demais. Confira o valor (em centavos).'],
    [{ maxEntries: 0 }, 'maxEntries', 'Use 1 ou mais (ou deixe sem limite).'],
    [{ modality: 'TRILHA' }, 'modality', 'Escolha a modalidade.'],
    [{ categoryId: 'x' }, 'categoryId', 'Escolha a categoria.'],
  ])('recusa %o', (patch, field, message) => {
    const input = { categoryId: ID, modality: 'MOTOCROSS', entryFeeCents: 15000, ...patch };
    expect(errorsOf(addEventCategorySchema, input)[field]).toBe(message);
  });

  it('a edição não troca a categoria (só modalidade, valor e vagas)', () => {
    expect(updateEventCategorySchema.safeParse({ categoryId: ID }).success).toBe(false);
    expect(updateEventCategorySchema.parse({ maxEntries: null })).toEqual({ maxEntries: null });
  });
});

describe('createHeatSchema / updateHeatSchema', () => {
  it('nome, horário opcional e uma ou mais categorias', () => {
    expect(createHeatSchema.parse({ name: 'Bateria 1', eventCategoryIds: [ID, ID2] })).toEqual({
      name: 'Bateria 1', scheduledAt: null, eventCategoryIds: [ID, ID2],
    });
  });

  it.each([
    [{ eventCategoryIds: [] }, 'eventCategoryIds', 'Escolha ao menos uma categoria.'],
    [{ eventCategoryIds: [ID, ID] }, 'eventCategoryIds', 'A mesma categoria foi escolhida duas vezes.'],
    [{ scheduledAt: '13/03/2027 09:00' }, 'scheduledAt', 'Use data e hora no formato ISO 8601 (ex.: 2027-03-13T09:00:00-03:00).'],
    [{ name: '' }, 'name', 'Informe o nome da bateria.'],
  ])('recusa %o', (patch, field, message) => {
    expect(errorsOf(createHeatSchema, { name: 'Bateria 1', eventCategoryIds: [ID], ...patch })[field]).toBe(message);
  });

  it('edição parcial; campo desconhecido é recusado', () => {
    expect(updateHeatSchema.parse({ scheduledAt: null })).toEqual({ scheduledAt: null });
    expect(updateHeatSchema.safeParse({ status: 'FINISHED' }).success).toBe(false);
  });
});

describe('calendarDateIn (dia no fuso do evento)', () => {
  it('22:00 de 13/03 em São Paulo já é 14/03 em UTC, mas o dia do evento é 13/03', () => {
    expect(calendarDateIn(new Date('2027-03-14T01:00:00Z'), 'America/Sao_Paulo')).toBe('2027-03-13');
    expect(calendarDateIn(new Date('2027-03-14T03:00:00Z'), 'America/Sao_Paulo')).toBe('2027-03-14');
  });
});
