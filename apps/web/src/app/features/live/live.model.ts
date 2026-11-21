import { type LiveGap } from '../../shared/format/race-time';

/**
 * O que o servidor envia ao telão/página pública (docs/arquitetura.md §5.4): classificação JÁ CALCULADA
 * pelo motor de regras. O front só exibe. Sem dados pessoais: apenas nº, nome de exibição
 * (completo ou iniciais, conforme a configuração de privacidade do evento) e equipe.
 * Quando existir a API, migra para `packages/shared`.
 */
export interface LiveStandingsDto {
  heat: {
    id: string;
    categoryName: string;
    label: string;
    /** Voltas completadas pelo líder. */
    leaderLaps: number;
    totalLaps: number;
    finished: boolean;
  };
  rows: LiveRow[];
  sponsors: { name: string; logoUrl: string }[];
  /** Momento do cálculo no servidor (ms desde 1970). */
  updatedAt: number;
}

export interface LiveRow {
  position: number;
  raceNumber: string;
  displayName: string;
  team: string | null;
  laps: number;
  bestLapMs: number | null;
  gap: LiveGap;
}
