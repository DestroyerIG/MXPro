import { type RaceConfig, minLapsToClassify } from './config.js';

/**
 * Resultado de uma bateria a partir dos eventos de cronometragem (docs/arquitetura.md §5.1).
 *
 * Função PURA e DETERMINÍSTICA: mesmos eventos + mesma configuração = mesmo resultado, em
 * qualquer ordem que os eventos cheguem. Sem banco, rede ou relógio: o "agora" não importa,
 * só os horários gravados nos eventos. Regras de negócio: ADR 0003.
 */

export type TimingEventType = 'LAP_PASS' | 'PENALTY' | 'DSQ' | 'UNDO' | 'FINISH_FLAG';

/** Evento de cronometragem como o motor precisa (append-only; correção = novo evento). */
export interface TimingEventInput {
  /** UUID gerado no aparelho: o mesmo id chegando duas vezes conta uma vez só. */
  id: string;
  type: TimingEventType;
  /** Inscrição do piloto; null nos eventos da bateria toda (bandeirada). */
  registrationId: string | null;
  /** Momento do toque, em ms desde 1970. É ele (e não a chegada ao servidor) que ordena tudo. */
  deviceTimestamp: number;
  payload?: { penaltyMs?: number; undoneEventId?: string };
}

/** Piloto na bateria. Uma bateria pode juntar categorias; cada piloto é classificado na sua. */
export interface HeatEntryInput {
  registrationId: string;
  categoryId: string;
}

export interface HeatResultInput {
  config: RaceConfig;
  /** Largada (ms desde 1970): a 1ª volta é medida a partir daqui. */
  startedAt: number;
  entries: readonly HeatEntryInput[];
  events: readonly TimingEventInput[];
}

/**
 * CLASSIFIED: tem posição (recebeu a bandeirada ou abandonou com o mínimo de voltas).
 * NOT_CLASSIFIED: completou voltas, mas abaixo do mínimo do vencedor.
 * DNS: não completou nenhuma volta válida ("não largou").
 * DSQ: desclassificado.
 */
export type HeatRowStatus = 'CLASSIFIED' | 'NOT_CLASSIFIED' | 'DNS' | 'DSQ';

/** Diferença para o líder da categoria. */
export type Gap = { type: 'LEADER' } | { type: 'TIME'; ms: number } | { type: 'LAPS'; laps: number };

export interface HeatRow {
  registrationId: string;
  categoryId: string;
  status: HeatRowStatus;
  /** 1, 2, 3… só para CLASSIFIED. */
  position: number | null;
  laps: number;
  /** Tempo de cada volta válida, em ordem. */
  lapTimesMs: number[];
  bestLapMs: number | null;
  /** Nº da volta mais rápida (1 = primeira). */
  bestLapNumber: number | null;
  penaltyMs: number;
  /** Da largada até a última passagem que conta, MAIS as penalidades. null sem voltas. */
  totalTimeMs: number | null;
  /** Recebeu a bandeirada (false = abandonou ou a bateria não terminou). */
  finished: boolean;
  gap: Gap | null;
}

export interface CategoryResult {
  categoryId: string;
  /** Voltas mínimas para ser classificado nesta categoria (depende do vencedor). */
  minLapsToClassify: number;
  rows: HeatRow[];
}

/** Passagem que não entrou no resultado, para a tela de revisão e auditoria. */
export interface IgnoredPass {
  eventId: string;
  registrationId: string;
  reason: 'BELOW_MIN_LAP' | 'AFTER_FINISH';
  /** Horário da passagem (ms desde 1970). */
  at: number;
  /** Tempo desde a última passagem válida (útil para "toque duplo de 0:02.1"). */
  sinceLastValidMs: number;
}

export interface HeatResult {
  /** Bandeirada dada: resultado final. Sem ela, a classificação é provisória (bateria em andamento). */
  finished: boolean;
  /** Momento da bandeirada (ms desde 1970), se houve. */
  flagAt: number | null;
  /** Uma classificação por categoria, na ordem em que as categorias aparecem nos inscritos. */
  categories: CategoryResult[];
  ignoredPasses: IgnoredPass[];
}

// ─── Passo 1: eventos que valem ───────────────────────────────────────────────────────────

/** Ordem total e estável: horário do toque; em empate, o id (nunca a ordem de chegada). */
function byTime(a: TimingEventInput, b: TimingEventInput): number {
  return a.deviceTimestamp - b.deviceTimestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Remove duplicados (mesmo id) e o que foi desfeito. Um UNDO não pode ser desfeito: a pista só
 * desfaz lançamentos, e isso mantém o resultado independente da ordem dos UNDO.
 */
function effectiveEvents(events: readonly TimingEventInput[]): TimingEventInput[] {
  const unique = new Map<string, TimingEventInput>();
  for (const e of events) if (!unique.has(e.id)) unique.set(e.id, e);
  const all = [...unique.values()];
  const undone = new Set(
    all.filter((e) => e.type === 'UNDO' && e.payload?.undoneEventId).map((e) => e.payload!.undoneEventId!),
  );
  return all.filter((e) => e.type !== 'UNDO' && !undone.has(e.id)).sort(byTime);
}

// ─── Passo 2: voltas de cada piloto ───────────────────────────────────────────────────────

interface PilotLaps {
  /** Horário de cada passagem que conta como volta. */
  passAt: number[];
  lapTimesMs: number[];
  finished: boolean;
}

/**
 * Voltas válidas de um piloto. Volta abaixo da mínima: a passagem é ignorada e a próxima volta é
 * medida a partir da última passagem válida (ADR 0003). Com bandeirada, a primeira passagem válida
 * a partir dela encerra a prova do piloto; o que vier depois não conta.
 */
function countLaps(
  passes: readonly TimingEventInput[],
  startedAt: number,
  minLapMs: number,
  flagAt: number | null,
  ignored: IgnoredPass[] | null,
): PilotLaps {
  const result: PilotLaps = { passAt: [], lapTimesMs: [], finished: false };
  let lastValidAt = startedAt;
  for (const p of passes) {
    const sinceLastValidMs = p.deviceTimestamp - lastValidAt;
    if (result.finished) {
      ignored?.push({ eventId: p.id, registrationId: p.registrationId!, reason: 'AFTER_FINISH', at: p.deviceTimestamp, sinceLastValidMs });
      continue;
    }
    if (sinceLastValidMs < minLapMs) {
      ignored?.push({ eventId: p.id, registrationId: p.registrationId!, reason: 'BELOW_MIN_LAP', at: p.deviceTimestamp, sinceLastValidMs });
      continue;
    }
    result.passAt.push(p.deviceTimestamp);
    result.lapTimesMs.push(sinceLastValidMs);
    lastValidAt = p.deviceTimestamp;
    if (flagAt !== null && p.deviceTimestamp >= flagAt) result.finished = true;
  }
  return result;
}

/**
 * Momento da bandeirada. Com o evento FINISH_FLAG, é ele (o primeiro, se houver mais de um).
 * Com número fixo de voltas e sem o evento, é a passagem em que o primeiro piloto completa as voltas.
 * "Tempo + N voltas" sem o evento: a bateria ainda não terminou.
 */
function findFlagAt(
  config: RaceConfig,
  effective: readonly TimingEventInput[],
  passesByPilot: Map<string, TimingEventInput[]>,
  startedAt: number,
): number | null {
  const flag = effective.find((e) => e.type === 'FINISH_FLAG');
  if (flag) return flag.deviceTimestamp;
  if (config.finish.type !== 'FIXED_LAPS') return null;
  const target = config.finish.laps;
  let first: number | null = null;
  for (const passes of passesByPilot.values()) {
    const at = countLaps(passes, startedAt, config.minLapMs, null, null).passAt[target - 1];
    if (at !== undefined && (first === null || at < first)) first = at;
  }
  return first;
}

// ─── Passo 3: classificação por categoria ─────────────────────────────────────────────────

const STATUS_ORDER: Record<HeatRowStatus, number> = { CLASSIFIED: 0, NOT_CLASSIFIED: 1, DNS: 2, DSQ: 3 };

/** Mais voltas primeiro; mesmas voltas, menor tempo total (com penalidade); por fim o id (estável). */
function compareRunning(a: HeatRow, b: HeatRow): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    b.laps - a.laps ||
    (a.totalTimeMs ?? Infinity) - (b.totalTimeMs ?? Infinity) ||
    (a.registrationId < b.registrationId ? -1 : a.registrationId > b.registrationId ? 1 : 0)
  );
}

export function computeHeatResult(input: HeatResultInput): HeatResult {
  const { config, startedAt, entries } = input;
  const known = new Set(entries.map((e) => e.registrationId));
  const effective = effectiveEvents(input.events).filter((e) => e.registrationId === null || known.has(e.registrationId));

  const passesByPilot = new Map<string, TimingEventInput[]>();
  const penaltyMs = new Map<string, number>();
  const disqualified = new Set<string>();
  for (const e of effective) {
    if (!e.registrationId) continue;
    if (e.type === 'LAP_PASS') passesByPilot.set(e.registrationId, [...(passesByPilot.get(e.registrationId) ?? []), e]);
    else if (e.type === 'PENALTY') penaltyMs.set(e.registrationId, (penaltyMs.get(e.registrationId) ?? 0) + Math.max(0, e.payload?.penaltyMs ?? 0));
    else if (e.type === 'DSQ') disqualified.add(e.registrationId);
  }

  const flagAt = findFlagAt(config, effective, passesByPilot, startedAt);
  const ignoredPasses: IgnoredPass[] = [];

  const rows: HeatRow[] = entries.map(({ registrationId, categoryId }) => {
    const laps = countLaps(passesByPilot.get(registrationId) ?? [], startedAt, config.minLapMs, flagAt, ignoredPasses);
    const penalty = penaltyMs.get(registrationId) ?? 0;
    const lastPassAt = laps.passAt.at(-1);
    const best = laps.lapTimesMs.length ? Math.min(...laps.lapTimesMs) : null;
    return {
      registrationId,
      categoryId,
      status: disqualified.has(registrationId) ? 'DSQ' : laps.passAt.length ? 'CLASSIFIED' : 'DNS',
      position: null,
      laps: laps.passAt.length,
      lapTimesMs: laps.lapTimesMs,
      bestLapMs: best,
      bestLapNumber: best === null ? null : laps.lapTimesMs.indexOf(best) + 1,
      penaltyMs: penalty,
      totalTimeMs: lastPassAt === undefined ? null : lastPassAt - startedAt + penalty,
      finished: laps.finished,
      gap: null,
    };
  });

  // Categorias na ordem em que aparecem nos inscritos.
  const categoryIds = [...new Set(entries.map((e) => e.categoryId))];
  const categories = categoryIds.map((categoryId): CategoryResult => {
    const own = rows.filter((r) => r.categoryId === categoryId);
    // Vencedor = quem tem mais voltas (e menor tempo) entre os não desclassificados.
    const contenders = own.filter((r) => r.status === 'CLASSIFIED').sort(compareRunning);
    const winnerLaps = contenders[0]?.laps ?? 0;
    const minLaps = minLapsToClassify(winnerLaps, config.minLeaderLapsPct);
    for (const r of contenders) if (r.laps < minLaps) r.status = 'NOT_CLASSIFIED';

    own.sort(compareRunning);
    const leader = own[0]?.status === 'CLASSIFIED' ? own[0] : undefined;
    let position = 0;
    for (const r of own) {
      if (r.status !== 'CLASSIFIED' || !leader) continue;
      r.position = ++position;
      r.gap =
        r === leader
          ? { type: 'LEADER' }
          : r.laps < leader.laps
            ? { type: 'LAPS', laps: leader.laps - r.laps }
            : { type: 'TIME', ms: r.totalTimeMs! - leader.totalTimeMs! };
    }
    return { categoryId, minLapsToClassify: minLaps, rows: own };
  });

  ignoredPasses.sort((a, b) => a.at - b.at || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  return { finished: flagAt !== null, flagAt, categories, ignoredPasses };
}
