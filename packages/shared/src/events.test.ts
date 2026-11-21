import { describe, expect, it } from 'vitest';
import { type z } from 'zod';
import { championshipInputSchema, createEventSchema, eventSchema, isRegistrationOpen, updateEventSchema } from './events.js';

const VALID = {
  name: 'Copa Verão de Motocross - Etapa 2',
  startDate: '2027-03-13',
  endDate: '2027-03-13',
  venue: 'Pista Terra Vermelha',
  city: 'Campo Largo',
  state: 'PR',
};

/** Erros por campo, como a API devolve em `details`. */
function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('createEventSchema', () => {
  it('aceita o mínimo e preenche os padrões (avulso, fuso de São Paulo, sem janela)', () => {
    expect(createEventSchema.parse(VALID)).toEqual({
      ...VALID,
      championshipId: null,
      stageNumber: null,
      timeZone: 'America/Sao_Paulo',
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationClosedEarly: false,
    });
  });

  it('normaliza UF minúscula e espaços', () => {
    const e = createEventSchema.parse({ ...VALID, state: ' sc ', name: '  Etapa  ' });
    expect(e.state).toBe('SC');
    expect(e.name).toBe('Etapa');
  });

  it('campos obrigatórios com mensagens em português', () => {
    expect(errorsOf(createEventSchema, {})).toMatchObject({
      name: 'Informe o nome.',
      startDate: 'Informe a data de início no formato AAAA-MM-DD.',
      venue: 'Informe o local.',
      city: 'Informe a cidade.',
      state: 'Informe a UF.',
    });
  });

  it.each([
    [{ state: 'XX' }, 'state', 'UF inválida.'],
    [{ startDate: '13/03/2027' }, 'startDate', 'Informe a data de início no formato AAAA-MM-DD.'],
    [{ startDate: '2027-02-30' }, 'startDate', 'Informe a data de início no formato AAAA-MM-DD.'],
    [{ endDate: '2027-03-12' }, 'endDate', 'O término não pode ser antes do início.'],
    [{ stageNumber: 2 }, 'stageNumber', 'Número de etapa só existe dentro de um campeonato.'],
    [{ timeZone: 'Brasil/Horario' }, 'timeZone', 'Fuso horário inválido.'],
    [
      { registrationOpensAt: '2027-02-01T09:00:00-03:00', registrationClosesAt: '2027-01-01T09:00:00-03:00' },
      'registrationClosesAt',
      'O encerramento das inscrições precisa ser depois da abertura.',
    ],
    [{ registrationOpensAt: '2027-02-01 09:00' }, 'registrationOpensAt', 'Use data e hora no formato ISO 8601 (ex.: 2027-01-15T09:00:00-03:00).'],
  ])('recusa %o', (patch, field, message) => {
    expect(errorsOf(createEventSchema, { ...VALID, ...patch })[field]).toBe(message);
  });

  it('evento de vários dias e etapa de campeonato', () => {
    const e = createEventSchema.parse({
      ...VALID,
      endDate: '2027-03-14',
      championshipId: '019a8f00-0000-7000-8000-000000000001',
      stageNumber: 2,
    });
    expect(e.stageNumber).toBe(2);
  });
});

describe('updateEventSchema / eventSchema (edição)', () => {
  it('aceita só parte dos campos', () => {
    expect(updateEventSchema.parse({ venue: 'Nova pista' })).toEqual({ venue: 'Nova pista' });
  });

  it('recusa campo desconhecido (não finge que salvou)', () => {
    expect(updateEventSchema.safeParse({ status: 'PUBLISHED' }).success).toBe(false);
  });

  it('as regras entre campos valem no RESULTADO da edição', () => {
    const current = { ...createEventSchema.parse(VALID) };
    const merged = { ...current, ...updateEventSchema.parse({ startDate: '2027-03-20' }) };
    expect(errorsOf(eventSchema, merged)).toEqual({ endDate: 'O término não pode ser antes do início.' });
  });
});

describe('championshipInputSchema', () => {
  it('nome e temporada', () => {
    expect(championshipInputSchema.parse({ name: ' Copa Verão ', season: 2027 })).toEqual({ name: 'Copa Verão', season: 2027 });
    expect(errorsOf(championshipInputSchema, { name: 'Co', season: 27 })).toEqual({
      name: 'Use pelo menos 3 caracteres.',
      season: 'Use um ano entre 2000 e 2100.',
    });
  });
});

describe('isRegistrationOpen', () => {
  const base = {
    status: 'PUBLISHED' as const,
    registrationOpensAt: new Date('2027-01-15T12:00:00Z'),
    registrationClosesAt: new Date('2027-03-11T02:59:00Z'),
    registrationClosedEarly: false,
  };
  const at = (iso: string) => new Date(iso);

  it('aberta dentro da janela', () => {
    expect(isRegistrationOpen(base, at('2027-02-01T00:00:00Z'))).toBe(true);
  });
  it('fechada antes de abrir e a partir do encerramento (o instante exato já conta como fechado)', () => {
    expect(isRegistrationOpen(base, at('2027-01-15T11:59:59Z'))).toBe(false);
    expect(isRegistrationOpen(base, at('2027-03-11T02:59:00Z'))).toBe(false);
  });
  it('sem data de encerramento: segue aberta', () => {
    expect(isRegistrationOpen({ ...base, registrationClosesAt: null }, at('2030-01-01T00:00:00Z'))).toBe(true);
  });
  it('fechada manualmente, mesmo dentro da janela', () => {
    expect(isRegistrationOpen({ ...base, registrationClosedEarly: true }, at('2027-02-01T00:00:00Z'))).toBe(false);
  });
  it.each(['DRAFT', 'FINISHED', 'CANCELED'] as const)('evento %s não recebe inscrição', (status) => {
    expect(isRegistrationOpen({ ...base, status }, at('2027-02-01T00:00:00Z'))).toBe(false);
  });
  it('sem data de abertura: ainda não abriu', () => {
    expect(isRegistrationOpen({ ...base, registrationOpensAt: null }, at('2027-02-01T00:00:00Z'))).toBe(false);
  });
});
