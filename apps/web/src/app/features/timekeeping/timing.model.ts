/**
 * Modelo da cronometragem (docs/arquitetura.md §5.2/§5.3).
 *
 * Princípio: o que o cronometrista faz vira EVENTO IMUTÁVEL (append-only). Voltas, último tempo,
 * penalidades e classificação são DERIVADOS da lista de eventos. Corrigir = novo evento (UNDO),
 * nunca editar/apagar. Quando existir a API, estes tipos migram para `packages/shared`.
 */

export type TimingEventType = 'LAP_PASS' | 'PENALTY' | 'DSQ' | 'UNDO' | 'FINISH_FLAG';

export interface TimingEvent {
  /** UUID gerado NO APARELHO: permite reenviar sem duplicar (o servidor ignora id repetido). */
  id: string;
  heatId: string;
  /** Inscrição (piloto na categoria). Nulo em eventos da bateria toda (ex.: bandeirada). */
  registrationId: string | null;
  type: TimingEventType;
  /** Momento do toque, em ms desde 1970 (relógio do aparelho; será ancorado ao servidor). */
  deviceTimestamp: number;
  source: 'MANUAL' | 'TRANSPONDER';
  deviceId: string;
  createdBy: string;
  payload: {
    penaltyMs?: number;
    /** Em UNDO: o evento que está sendo desfeito. */
    undoneEventId?: string;
    reason?: string;
  };
}

/** Piloto inscrito na bateria (o que a tela precisa; sem dados pessoais além do nome). */
export interface HeatEntry {
  registrationId: string;
  raceNumber: string;
  pilotName: string;
}

export interface HeatInfo {
  id: string;
  label: string;
  categoryName: string;
  timekeeperName: string;
  /** Largada, ms desde 1970. */
  startedAt: number;
  /** Duração por tempo; depois dela vêm `extraLaps` voltas ("tempo + 2 voltas"). */
  durationMs: number;
  extraLaps: number;
  /** Penalidade padrão por infração, da configuração da prova. */
  defaultPenaltyMs: number;
}
