import { z } from 'zod';
import { type MotocrossConfigV1, START_TYPES, TIEBREAKS } from './config.js';

/**
 * Validação da configuração da prova (entrada da API e leitura do banco).
 * Limites existem para pegar erro de digitação (ex.: 200 minutos em vez de 20), não para engessar.
 */

const MINUTE = 60_000;

const ms = (label: string, max: number, maxLabel: string) =>
  z
    .number(`Informe ${label}.`)
    .int(`Use um número inteiro de milissegundos para ${label}.`)
    .min(0, `${label[0]?.toUpperCase()}${label.slice(1)} não pode ser negativa.`)
    .max(max, `Use no máximo ${maxLabel}.`);

const finishSchema = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('TIME_PLUS_LAPS'),
      durationMs: ms('a duração', 3 * 60 * MINUTE, '3 horas').min(MINUTE, 'Use pelo menos 1 minuto de duração.'),
      extraLaps: z.number('Informe as voltas extras.').int('Use um número inteiro.').min(0, 'Use 0 ou mais.').max(10, 'Use no máximo 10 voltas extras.'),
    }),
    z.object({
      type: z.literal('FIXED_LAPS'),
      laps: z.number('Informe o número de voltas.').int('Use um número inteiro.').min(1, 'Use pelo menos 1 volta.').max(200, 'Use no máximo 200 voltas.'),
    }),
  ],
  'Escolha como a bateria termina.',
);

export const motocrossConfigSchema: z.ZodType<MotocrossConfigV1> = z.object({
  schemaVersion: z.literal(1, 'Versão de configuração não suportada.'),
  modality: z.literal('MOTOCROSS', 'Modalidade não suportada nesta versão.'),
  start: z.enum(START_TYPES, 'Escolha o tipo de largada.'),
  finish: finishSchema,
  heatsPerCategory: z.number('Informe o número de baterias.').int('Use um número inteiro.').min(1, 'Use pelo menos 1 bateria.').max(10, 'Use no máximo 10 baterias.'),
  minLapMs: ms('a volta mínima', 30 * MINUTE, '30 minutos'),
  defaultPenaltyMs: ms('a penalidade padrão', 10 * MINUTE, '10 minutos'),
  minLeaderLapsPct: z.number('Informe o percentual mínimo.').int('Use um número inteiro.').min(0, 'Use de 0 a 100.').max(100, 'Use de 0 a 100.'),
  points: z
    .array(z.number().int('Use pontos inteiros.').min(0, 'Pontos não podem ser negativos.').max(1000, 'Use no máximo 1000 pontos.'), 'Informe a tabela de pontos.')
    .min(1, 'Informe os pontos de pelo menos o 1º lugar.')
    .max(100, 'Use no máximo 100 posições na tabela.')
    // Posição melhor nunca vale menos que a de trás (pegaria um 2º lugar valendo mais que o 1º).
    .refine((p) => p.every((v, i) => i === 0 || v <= p[i - 1]!), 'Cada posição deve valer o mesmo ou menos que a anterior.'),
  tiebreak: z.enum(TIEBREAKS, 'Escolha o critério de desempate.'),
});

/** Hoje há uma só versão/modalidade; novas entram aqui como união discriminada por `modality`/`schemaVersion`. */
export const raceConfigSchema = motocrossConfigSchema;
