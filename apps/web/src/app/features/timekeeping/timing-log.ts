import { HeatEntry, TimingEvent } from './timing.model';

/**
 * Derivações do log de eventos de cronometragem (funções puras, sem Angular).
 *
 * Isto é a VISÃO DE PISTA (o que o cronometrista precisa ver agora). A classificação oficial,
 * com volta mínima, desempate e pontos, será do motor de regras (`packages/rules-engine`).
 */

export interface PilotSummary {
  entry: HeatEntry;
  laps: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  penaltyMs: number;
  disqualified: boolean;
}

export interface PassView {
  eventId: string;
  raceNumber: string;
  lap: number;
  lapMs: number;
}

/** Eventos que valem: sem os UNDO e sem os que foram desfeitos, em ordem de horário do toque. */
function effective(events: readonly TimingEvent[]): TimingEvent[] {
  const undone = new Set(events.filter((e) => e.type === 'UNDO').map((e) => e.payload.undoneEventId));
  return events
    .filter((e) => e.type !== 'UNDO' && !undone.has(e.id))
    .sort((a, b) => a.deviceTimestamp - b.deviceTimestamp);
}

/** Passagens válidas por piloto, cada uma com nº da volta e tempo da volta. */
function lapsByPilot(events: readonly TimingEvent[], heatStartedAt: number): Map<string, PassView[]> {
  const result = new Map<string, PassView[]>();
  const lastPassAt = new Map<string, number>(); // horário da passagem anterior de cada piloto
  for (const e of effective(events)) {
    if (e.type !== 'LAP_PASS' || !e.registrationId) continue;
    const list = result.get(e.registrationId) ?? [];
    const previousAt = lastPassAt.get(e.registrationId) ?? heatStartedAt; // 1ª volta conta da largada
    list.push({ eventId: e.id, raceNumber: '', lap: list.length + 1, lapMs: e.deviceTimestamp - previousAt });
    result.set(e.registrationId, list);
    lastPassAt.set(e.registrationId, e.deviceTimestamp);
  }
  return result;
}

export function summarizePilots(
  entries: readonly HeatEntry[],
  events: readonly TimingEvent[],
  heatStartedAt: number,
): PilotSummary[] {
  const valid = effective(events);
  const laps = lapsByPilot(events, heatStartedAt);
  return entries.map((entry) => {
    const own = valid.filter((e) => e.registrationId === entry.registrationId);
    const passes = laps.get(entry.registrationId) ?? [];
    return {
      entry,
      laps: passes.length,
      lastLapMs: passes.at(-1)?.lapMs ?? null,
      bestLapMs: passes.length ? Math.min(...passes.map((p) => p.lapMs)) : null,
      penaltyMs: own.filter((e) => e.type === 'PENALTY').reduce((sum, e) => sum + (e.payload.penaltyMs ?? 0), 0),
      disqualified: own.some((e) => e.type === 'DSQ'),
    };
  });
}

/** Últimas passagens de todos os pilotos, mais recente primeiro. */
export function recentPasses(
  entries: readonly HeatEntry[],
  events: readonly TimingEvent[],
  heatStartedAt: number,
  limit: number,
): PassView[] {
  const numberOf = new Map(entries.map((e) => [e.registrationId, e.raceNumber]));
  const at = new Map(events.map((e) => [e.id, e.deviceTimestamp]));
  return [...lapsByPilot(events, heatStartedAt)]
    .flatMap(([registrationId, passes]) => passes.map((p) => ({ ...p, raceNumber: numberOf.get(registrationId) ?? '?' })))
    .sort((a, b) => (at.get(b.eventId) ?? 0) - (at.get(a.eventId) ?? 0))
    .slice(0, limit);
}

/** Última ação deste log que ainda vale (alvo do "Desfazer última"). Ordem de registro, não de horário. */
export function lastUndoable(events: readonly TimingEvent[]): TimingEvent | undefined {
  const undone = new Set(events.filter((e) => e.type === 'UNDO').map((e) => e.payload.undoneEventId));
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== 'UNDO' && !undone.has(e.id)) return e;
  }
  return undefined;
}

export function isFinished(events: readonly TimingEvent[]): boolean {
  return effective(events).some((e) => e.type === 'FINISH_FLAG');
}
