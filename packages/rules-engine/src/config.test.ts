import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { DEFAULT_POINTS, MOTOCROSS_TEMPLATE, minLapsToClassify } from './config.js';
import { raceConfigSchema } from './config.schema.js';

function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const r = schema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('modelo pronto Motocross', () => {
  it('é uma configuração válida, com os valores do escopo (PDF, página 4)', () => {
    expect(raceConfigSchema.parse(MOTOCROSS_TEMPLATE)).toEqual(MOTOCROSS_TEMPLATE);
    expect(MOTOCROSS_TEMPLATE).toMatchObject({
      start: 'GRID_DRAW', // grid por sorteio
      finish: { type: 'TIME_PLUS_LAPS', durationMs: 1_200_000, extraLaps: 2 }, // 20 min + 2 voltas
      heatsPerCategory: 2,
      minLapMs: 45_000, // 00:45.000
      defaultPenaltyMs: 10_000, // +10 s por infração
      tiebreak: 'LAST_HEAT', // melhor bateria final
    });
    expect(DEFAULT_POINTS.slice(0, 6)).toEqual([25, 22, 20, 18, 16, 15]);
  });

  it('a tabela de pontos do modelo é uma CÓPIA (editar uma prova não altera o modelo)', () => {
    expect(MOTOCROSS_TEMPLATE.points).not.toBe(DEFAULT_POINTS);
  });
});

describe('raceConfigSchema', () => {
  const valid = MOTOCROSS_TEMPLATE;

  it('aceita número fixo de voltas', () => {
    expect(raceConfigSchema.safeParse({ ...valid, finish: { type: 'FIXED_LAPS', laps: 12 } }).success).toBe(true);
  });

  it.each([
    [{ points: [22, 25] }, 'points', 'Cada posição deve valer o mesmo ou menos que a anterior.'],
    [{ points: [] }, 'points', 'Informe os pontos de pelo menos o 1º lugar.'],
    [{ points: [25, -1] }, 'points.1', 'Pontos não podem ser negativos.'],
    [{ minLapMs: 45.5 }, 'minLapMs', 'Use um número inteiro de milissegundos para a volta mínima.'],
    [{ minLapMs: -1 }, 'minLapMs', 'A volta mínima não pode ser negativa.'],
    [{ minLeaderLapsPct: 120 }, 'minLeaderLapsPct', 'Use de 0 a 100.'],
    [{ heatsPerCategory: 0 }, 'heatsPerCategory', 'Use pelo menos 1 bateria.'],
    [{ finish: { type: 'TIME_PLUS_LAPS', durationMs: 200 * 60_000, extraLaps: 2 } }, 'finish.durationMs', 'Use no máximo 3 horas.'],
    [{ finish: { type: 'TIME_PLUS_LAPS', durationMs: 30_000, extraLaps: 2 } }, 'finish.durationMs', 'Use pelo menos 1 minuto de duração.'],
    [{ finish: { type: 'FIXED_LAPS', laps: 0 } }, 'finish.laps', 'Use pelo menos 1 volta.'],
    [{ finish: { type: 'POR_SORTE' } }, 'finish.type', 'Escolha como a bateria termina.'],
    [{ schemaVersion: 2 }, 'schemaVersion', 'Versão de configuração não suportada.'],
    [{ modality: 'ENDURO' }, 'modality', 'Modalidade não suportada nesta versão.'],
  ])('recusa %o', (patch, field, message) => {
    expect(errorsOf(raceConfigSchema, { ...valid, ...patch })[field]).toBe(message);
  });

  it('empate na tabela é permitido (ex.: 1º e 2º valendo o mesmo)', () => {
    expect(raceConfigSchema.safeParse({ ...valid, points: [20, 20, 18] }).success).toBe(true);
  });
});

describe('minLapsToClassify (mínimo de voltas para ser classificado)', () => {
  it.each([
    [9, 50, 5], // 4,5 → 5 (arredonda para cima)
    [10, 50, 5],
    [10, 75, 8], // 7,5 → 8
    [3, 30, 1], // 0,9 → 1
    [10, 0, 1], // 0% ainda exige 1 volta completa
    [10, 100, 10],
    [0, 50, 1],
  ])('vencedor com %d voltas e %d%% → %d', (winner, pct, expected) => {
    expect(minLapsToClassify(winner, pct)).toBe(expected);
  });
});
