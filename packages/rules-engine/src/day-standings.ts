import type { RaceConfig } from './config.js';
import type { HeatResult, HeatRow, HeatRowStatus } from './heat-result.js';

/**
 * Pontos por bateria e geral do dia de uma categoria (docs/arquitetura.md §4.1, ADR 0003).
 * Função pura e determinística, como o resto do motor.
 */

/** Pontos de um piloto numa bateria: só quem é classificado pontua, conforme a tabela da prova. */
export function heatPoints(row: Pick<HeatRow, 'status' | 'position'>, config: RaceConfig): number {
  if (row.status !== 'CLASSIFIED' || row.position === null) return 0;
  return config.points[row.position - 1] ?? 0;
}

export interface DayStandingsInput {
  config: RaceConfig;
  categoryId: string;
  /** Baterias do dia, na ORDEM DA PROGRAMAÇÃO (a última é a usada no desempate). */
  heats: readonly { heatId: string; result: HeatResult }[];
}

/** Desempenho de um piloto numa bateria do dia. null = não correu essa bateria. */
export interface DayHeatCell {
  heatId: string;
  status: HeatRowStatus;
  position: number | null;
  points: number;
}

export interface DayRow {
  registrationId: string;
  /**
   * 1, 2, 3… para quem foi classificado em ao menos uma bateria (mesmo com 0 ponto, fora da tabela);
   * null para quem nunca foi classificado (DNS, DSQ ou abaixo do mínimo de voltas em todas).
   */
  position: number | null;
  totalPoints: number;
  /** Uma célula por bateria, na ordem da programação. */
  heats: (DayHeatCell | null)[];
  /** Empatou em pontos com outro piloto e a posição saiu do critério de desempate. */
  decidedByTiebreak: boolean;
}

export interface DayStandings {
  categoryId: string;
  /** Alguma bateria ainda sem bandeirada: o geral é provisório. */
  provisional: boolean;
  rows: DayRow[];
}

/**
 * Compara dois pilotos empatados em pontos pelo critério da prova.
 * LAST_HEAT: melhor posição na última bateria; quem não foi classificado nela fica atrás.
 * Persistindo (ex.: nenhum dos dois classificado), olha a bateria anterior, e assim por diante.
 */
function compareTiebreak(a: DayRow, b: DayRow): number {
  for (let i = a.heats.length - 1; i >= 0; i--) {
    const pa = a.heats[i]?.position ?? Infinity;
    const pb = b.heats[i]?.position ?? Infinity;
    if (pa !== pb) return pa < pb ? -1 : 1;
  }
  return 0;
}

const byId = (a: DayRow, b: DayRow) => (a.registrationId < b.registrationId ? -1 : a.registrationId > b.registrationId ? 1 : 0);

export function computeDayStandings(input: DayStandingsInput): DayStandings {
  const { config, categoryId, heats } = input;

  // Pilotos da categoria que aparecem em qualquer bateria do dia.
  const rowsByPilot = new Map<string, DayRow>();
  heats.forEach(({ heatId, result }, index) => {
    const category = result.categories.find((c) => c.categoryId === categoryId);
    for (const r of category?.rows ?? []) {
      let day = rowsByPilot.get(r.registrationId);
      if (!day) {
        day = { registrationId: r.registrationId, position: null, totalPoints: 0, heats: heats.map(() => null), decidedByTiebreak: false };
        rowsByPilot.set(r.registrationId, day);
      }
      const points = heatPoints(r, config);
      day.heats[index] = { heatId, status: r.status, position: r.position, points };
      day.totalPoints += points;
    }
  });

  const rows = [...rowsByPilot.values()];
  // Pontos (mais primeiro) → desempate da prova → id (só para a ordem ser sempre a mesma).
  rows.sort((a, b) => b.totalPoints - a.totalPoints || compareTiebreak(a, b) || byId(a, b));

  let position = 0;
  for (const [i, row] of rows.entries()) {
    if (!row.heats.some((h) => h?.status === 'CLASSIFIED')) continue; // nunca classificado: sem posição
    row.position = ++position;
    const tiedWithNeighbor = [rows[i - 1], rows[i + 1]].some((other) => other && other.totalPoints === row.totalPoints);
    row.decidedByTiebreak = tiedWithNeighbor;
  }

  return { categoryId, provisional: heats.some((h) => !h.result.finished), rows };
}
