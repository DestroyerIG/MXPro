/**
 * Configuração da prova (docs/arquitetura.md §5.1) — tipos e modelos prontos, SEM Zod
 * (o front importa daqui sem levar a biblioteca de validação; a validação fica em config.schema.ts).
 *
 * É um JSON versionado (`schemaVersion`): uma prova configurada hoje continua sendo lida igual
 * no futuro, mesmo que surjam campos novos. Tempo sempre em milissegundos inteiros.
 *
 * Regras de negócio decididas no ADR 0003 (docs/decisions/0003-regras-do-motocross.md).
 */

/** Como o grid de largada é montado (usado na fase de inscrições/grid). */
export const START_TYPES = ['GRID_DRAW', 'GRID_REGISTRATION_ORDER'] as const;
export type StartType = (typeof START_TYPES)[number];
export const START_LABELS: Record<StartType, string> = {
  GRID_DRAW: 'Grid por sorteio',
  GRID_REGISTRATION_ORDER: 'Grid pela ordem de inscrição',
};

/** Como a bateria termina. */
export type FinishRule =
  /** "Tempo + N voltas": zerado o relógio, o líder faz mais N voltas e recebe a bandeirada. */
  | { type: 'TIME_PLUS_LAPS'; durationMs: number; extraLaps: number }
  /** Número fixo de voltas: o líder recebe a bandeirada ao completá-las. */
  | { type: 'FIXED_LAPS'; laps: number };

export const TIEBREAKS = ['LAST_HEAT'] as const;
export type Tiebreak = (typeof TIEBREAKS)[number];
export const TIEBREAK_LABELS: Record<Tiebreak, string> = {
  LAST_HEAT: 'Melhor resultado na última bateria',
};

/** Configuração de uma prova de Motocross, versão 1. */
export interface MotocrossConfigV1 {
  schemaVersion: 1;
  modality: 'MOTOCROSS';
  start: StartType;
  finish: FinishRule;
  /** Quantas baterias cada categoria corre no dia. */
  heatsPerCategory: number;
  /** Volta mais curta que isto não conta: a passagem é ignorada (toque duplo, atalho). */
  minLapMs: number;
  /** Penalidade padrão sugerida na tela de pista (ex.: +10 s por infração). */
  defaultPenaltyMs: number;
  /** % mínimo das voltas do vencedor para ser classificado (arredondado para cima). */
  minLeaderLapsPct: number;
  /** Pontos por posição: [0] = 1º lugar. Fora da tabela: 0 ponto. */
  points: number[];
  tiebreak: Tiebreak;
}

/** Hoje só Motocross; as demais modalidades entram como novos tipos desta união. */
export type RaceConfig = MotocrossConfigV1;

/** Tabela de pontos comum no motocross (escopo: 1º=25, 2º=22, 3º=20, 4º=18, 5º=16, 6º=15…). */
export const DEFAULT_POINTS: readonly number[] = [25, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

/** Modelo pronto "Motocross" (PDF, página 4): o organizador parte daqui e ajusta. */
export const MOTOCROSS_TEMPLATE: MotocrossConfigV1 = {
  schemaVersion: 1,
  modality: 'MOTOCROSS',
  start: 'GRID_DRAW',
  finish: { type: 'TIME_PLUS_LAPS', durationMs: 20 * 60_000, extraLaps: 2 },
  heatsPerCategory: 2,
  minLapMs: 45_000,
  defaultPenaltyMs: 10_000,
  minLeaderLapsPct: 50,
  points: [...DEFAULT_POINTS],
  tiebreak: 'LAST_HEAT',
};

/**
 * Voltas mínimas para ser classificado, dado quantas voltas o vencedor fez.
 * Ex.: vencedor com 9 voltas e 50% → precisa de 5 (4,5 arredondado para cima).
 * Sempre pelo menos 1 volta (quem não completou nenhuma nunca é classificado).
 */
export function minLapsToClassify(winnerLaps: number, minLeaderLapsPct: number): number {
  // Arredondar para cima só com inteiros: (a + 99) / 100 truncado = teto de a / 100, sem float.
  return Math.max(1, Math.floor((winnerLaps * minLeaderLapsPct + 99) / 100));
}
