import type { FinishRule, RaceConfig, StartType, Tiebreak } from '@mxpro/rules-engine';
import { msToDisplay, parseRaceTime } from '../../../../shared/format/race-time';

/**
 * Modelo do formulário de regras: os campos como o organizador DIGITA (texto), separados da
 * configuração do motor (milissegundos inteiros). A conversão fica aqui, em funções puras e
 * testadas, e não no componente (docs/arquitetura.md §6: nada de regra de negócio em componente).
 */
export interface RulesFormModel {
  start: StartType;
  finishType: FinishRule['type'];
  /** Duração da bateria em minutos ("20") ou minutos:segundos ("20:30"). */
  duration: string;
  /** Voltas depois de zerar o relógio ("Tempo + 2 voltas"). */
  extraLaps: string;
  /** Número fixo de voltas. */
  laps: string;
  heatsPerCategory: string;
  /** Volta mínima válida, como no PDF: "0:45.000". */
  minLap: string;
  /** Penalidade padrão em segundos ("10" ou "2,5"). */
  penalty: string;
  minLeaderLapsPct: string;
  /** Pontos por posição: [0] = 1º lugar. */
  points: string[];
  tiebreak: Tiebreak;
  /** Motivo da mudança (obrigatório depois da largada). Não faz parte da configuração. */
  reason: string;
}

const MINUTE = 60_000;

/** "20" (minutos cheios) ou "20:30". */
function durationToInput(ms: number): string {
  const minutes = Math.floor(ms / MINUTE);
  const seconds = Math.floor((ms % MINUTE) / 1000);
  return seconds ? `${minutes}:${String(seconds).padStart(2, '0')}` : String(minutes);
}

/** Lê "20" (minutos) ou "20:30" (minutos:segundos). */
export function parseDuration(text: string): number | null {
  const match = /^(\d{1,3})(?::([0-5]\d))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * MINUTE + Number(match[2] ?? 0) * 1000;
}

/** "10" ou "2,5" segundos → ms. Até 3 casas (milissegundo). */
export function parseSeconds(text: string): number | null {
  const match = /^(\d{1,4})(?:[.,](\d{1,3}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'));
}

function secondsToInput(ms: number): string {
  const s = Math.floor(ms / 1000);
  const fraction = String(ms % 1000).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${s},${fraction}` : String(s);
}

/** Inteiro sem sinal, como digitado ("2" → 2; "2,5" e "" → null). */
export function parseCount(text: string): number | null {
  return /^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null;
}

export function toFormModel(config: RaceConfig): RulesFormModel {
  const { finish } = config;
  return {
    start: config.start,
    finishType: finish.type,
    // O tipo de término que não está em uso ainda ganha um valor razoável, para quem trocar.
    duration: durationToInput(finish.type === 'TIME_PLUS_LAPS' ? finish.durationMs : 20 * MINUTE),
    extraLaps: String(finish.type === 'TIME_PLUS_LAPS' ? finish.extraLaps : 2),
    laps: String(finish.type === 'FIXED_LAPS' ? finish.laps : 10),
    heatsPerCategory: String(config.heatsPerCategory),
    minLap: msToDisplay(config.minLapMs),
    penalty: secondsToInput(config.defaultPenaltyMs),
    minLeaderLapsPct: String(config.minLeaderLapsPct),
    points: config.points.map(String),
    tiebreak: config.tiebreak,
    reason: '',
  };
}

/**
 * Monta a configuração para a API. Só é chamada com o formulário válido; se ainda assim algo não
 * puder ser lido, devolve null (a API valida de novo de qualquer jeito, com o motor de regras).
 */
export function toConfig(m: RulesFormModel): RaceConfig | null {
  const heats = parseCount(m.heatsPerCategory);
  const minLapMs = parseRaceTime(m.minLap);
  const penaltyMs = parseSeconds(m.penalty);
  const pct = parseCount(m.minLeaderLapsPct);
  const points = m.points.map(parseCount);
  let finish: FinishRule | null = null;
  if (m.finishType === 'TIME_PLUS_LAPS') {
    const durationMs = parseDuration(m.duration);
    const extraLaps = parseCount(m.extraLaps);
    if (durationMs !== null && extraLaps !== null) finish = { type: 'TIME_PLUS_LAPS', durationMs, extraLaps };
  } else {
    const laps = parseCount(m.laps);
    if (laps !== null) finish = { type: 'FIXED_LAPS', laps };
  }
  if (finish === null || heats === null || minLapMs === null || penaltyMs === null || pct === null) return null;
  if (points.some((p) => p === null)) return null;
  return {
    schemaVersion: 1,
    modality: 'MOTOCROSS',
    start: m.start,
    finish,
    heatsPerCategory: heats,
    minLapMs,
    defaultPenaltyMs: penaltyMs,
    minLeaderLapsPct: pct,
    points: points as number[],
    tiebreak: m.tiebreak,
  };
}

/**
 * Erros da API vêm com o caminho do campo na configuração ("finish.durationMs"); aqui viram o
 * nome do campo do formulário onde a mensagem deve aparecer.
 */
export const SERVER_FIELD_MAP: Record<string, keyof RulesFormModel> = {
  start: 'start',
  'finish.durationMs': 'duration',
  'finish.extraLaps': 'extraLaps',
  'finish.laps': 'laps',
  finish: 'finishType',
  heatsPerCategory: 'heatsPerCategory',
  minLapMs: 'minLap',
  defaultPenaltyMs: 'penalty',
  minLeaderLapsPct: 'minLeaderLapsPct',
  points: 'points',
  tiebreak: 'tiebreak',
  reason: 'reason',
};
