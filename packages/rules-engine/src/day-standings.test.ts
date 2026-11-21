import { describe, expect, it } from 'vitest';
import { MOTOCROSS_TEMPLATE, type RaceConfig } from './config.js';
import { type DayStandings, computeDayStandings, heatPoints } from './day-standings.js';
import { type HeatResult, type HeatRowStatus, type TimingEventInput, computeHeatResult } from './heat-result.js';

const CONFIG: RaceConfig = { ...MOTOCROSS_TEMPLATE }; // 25, 22, 20, 18, 16, 15, 14…

/**
 * Resultado de bateria compacto: cada item é "piloto:posição" ou "piloto:STATUS".
 * Ex.: heat(['A:1', 'B:2', 'C:DSQ'])
 */
function heat(spec: string[], opts: { categoryId?: string; finished?: boolean } = {}): HeatResult {
  const rows = spec.map((s) => {
    const [registrationId, value] = s.split(':') as [string, string];
    const position = /^\d+$/.test(value) ? Number(value) : null;
    const status: HeatRowStatus = position ? 'CLASSIFIED' : (value as HeatRowStatus);
    return {
      registrationId, categoryId: opts.categoryId ?? 'mx1', status, position, laps: 0, lapTimesMs: [], bestLapMs: null,
      bestLapNumber: null, penaltyMs: 0, totalTimeMs: null, finished: true, gap: null,
    };
  });
  return {
    finished: opts.finished ?? true,
    flagAt: 0,
    categories: [{ categoryId: opts.categoryId ?? 'mx1', minLapsToClassify: 1, rows }],
    ignoredPasses: [],
  };
}

function day(...heats: HeatResult[]): DayStandings {
  return computeDayStandings({ config: CONFIG, categoryId: 'mx1', heats: heats.map((result, i) => ({ heatId: `b${i + 1}`, result })) });
}
/** "posição piloto pontos" */
const table = (d: DayStandings) => d.rows.map((r) => `${r.position ?? '-'} ${r.registrationId} ${r.totalPoints}`);

describe('heatPoints', () => {
  it('pontos pela tabela; fora da tabela, 0', () => {
    expect(heatPoints({ status: 'CLASSIFIED', position: 1 }, CONFIG)).toBe(25);
    expect(heatPoints({ status: 'CLASSIFIED', position: 6 }, CONFIG)).toBe(15);
    expect(heatPoints({ status: 'CLASSIFIED', position: 21 }, CONFIG)).toBe(0);
  });

  it.each(['NOT_CLASSIFIED', 'DNS', 'DSQ'] as const)('%s não pontua (mesmo que venha uma posição junto)', (status) => {
    expect(heatPoints({ status, position: 1 }, CONFIG)).toBe(0);
  });

  it('usa a tabela da prova (configurável)', () => {
    expect(heatPoints({ status: 'CLASSIFIED', position: 2 }, { ...CONFIG, points: [10, 8] })).toBe(8);
  });
});

describe('geral do dia', () => {
  it('soma os pontos das baterias e ordena', () => {
    // A: 1º + 2º = 47; B: 2º + 1º = 47 (empate, decide a última); C: 3º + 3º = 40.
    const d = day(heat(['A:1', 'B:2', 'C:3']), heat(['B:1', 'A:2', 'C:3']));
    expect(table(d)).toEqual(['1 B 47', '2 A 47', '3 C 40']);
  });

  it('desempate: quem foi melhor na ÚLTIMA bateria fica à frente (ADR 0003)', () => {
    const d = day(heat(['A:1', 'B:2']), heat(['B:1', 'A:2']));
    expect(d.rows.map((r) => [r.registrationId, r.decidedByTiebreak])).toEqual([['B', true], ['A', true]]);
  });

  it('desempate persistindo na última (nenhum classificado nela): decide a anterior', () => {
    // 3 baterias. A e B somam 42 cada; na última, os dois foram DSQ; na 2ª, B foi melhor.
    const d = day(heat(['A:2', 'B:3']), heat(['B:2', 'A:3']), heat(['C:1', 'A:DSQ', 'B:DSQ']));
    expect(table(d)).toEqual(['1 B 42', '2 A 42', '3 C 25']);
  });

  it('quem não empatou não é marcado como decidido no desempate', () => {
    const d = day(heat(['A:1', 'B:2']), heat(['A:1', 'B:2']));
    expect(d.rows.every((r) => !r.decidedByTiebreak)).toBe(true);
  });

  it('célula por bateria (posição, situação e pontos) e "não correu" como null', () => {
    const d = day(heat(['A:1', 'B:2']), heat(['A:DSQ']));
    const b = d.rows.find((r) => r.registrationId === 'B')!;
    expect(b.heats).toEqual([{ heatId: 'b1', status: 'CLASSIFIED', position: 2, points: 22 }, null]);
    const a = d.rows.find((r) => r.registrationId === 'A')!;
    expect(a.heats[1]).toEqual({ heatId: 'b2', status: 'DSQ', position: null, points: 0 });
  });

  it('desclassificado numa bateria perde só os pontos dela', () => {
    const d = day(heat(['A:1', 'B:2']), heat(['B:1', 'A:DSQ']));
    expect(table(d)).toEqual(['1 B 47', '2 A 25']);
  });

  it('classificado fora da tabela (0 ponto) ainda tem posição; nunca classificado fica sem', () => {
    const many = Array.from({ length: 21 }, (_, i) => `P${String(i + 1).padStart(2, '0')}:${i + 1}`);
    const d = day(heat([...many, 'X:DNS', 'Y:NOT_CLASSIFIED']));
    const p21 = d.rows.find((r) => r.registrationId === 'P21')!;
    expect(p21).toMatchObject({ position: 21, totalPoints: 0 });
    expect(d.rows.slice(-2).map((r) => [r.registrationId, r.position])).toEqual([['X', null], ['Y', null]]);
  });

  it('considera só a categoria pedida (bateria que junta categorias)', () => {
    const joint: HeatResult = {
      ...heat(['A:1']),
      categories: [heat(['A:1', 'B:2']).categories[0]!, heat(['M1:1'], { categoryId: 'master' }).categories[0]!],
    };
    expect(table(day(joint))).toEqual(['1 A 25', '2 B 22']);
  });

  it('geral provisório enquanto alguma bateria não teve bandeirada', () => {
    expect(day(heat(['A:1']), heat(['A:1'], { finished: false })).provisional).toBe(true);
    expect(day(heat(['A:1']), heat(['A:1'])).provisional).toBe(false);
  });

  it('sem baterias: geral vazio', () => {
    expect(day().rows).toEqual([]);
  });
});

describe('ponta a ponta: eventos da pista → baterias → geral do dia', () => {
  const START = 1_800_000_000_000;
  let seq = 0;
  const ev = (type: TimingEventInput['type'], reg: string | null, s: number): TimingEventInput => ({
    id: `e${String(++seq).padStart(4, '0')}`, type, registrationId: reg, deviceTimestamp: START + s * 1000,
  });
  const entries = ['A', 'B', 'C'].map((registrationId) => ({ registrationId, categoryId: 'mx1' }));
  const config: RaceConfig = { ...CONFIG, finish: { type: 'FIXED_LAPS', laps: 2 } };

  it('duas baterias com toque duplo e desclassificação', () => {
    const b1 = computeHeatResult({
      config, startedAt: START, entries,
      events: [ev('LAP_PASS', 'A', 60), ev('LAP_PASS', 'A', 61), ev('LAP_PASS', 'A', 120), ev('LAP_PASS', 'B', 62), ev('LAP_PASS', 'B', 125), ev('LAP_PASS', 'C', 70), ev('LAP_PASS', 'C', 140)],
    });
    const b2 = computeHeatResult({
      config, startedAt: START, entries,
      events: [ev('LAP_PASS', 'B', 60), ev('LAP_PASS', 'B', 120), ev('LAP_PASS', 'A', 61), ev('LAP_PASS', 'A', 121), ev('LAP_PASS', 'C', 65), ev('LAP_PASS', 'C', 130), ev('DSQ', 'C', 131)],
    });
    const d = computeDayStandings({ config, categoryId: 'mx1', heats: [{ heatId: 'b1', result: b1 }, { heatId: 'b2', result: b2 }] });
    // b1: A 1º (25), B 2º (22), C 3º (20). b2: B 1º (25), A 2º (22), C DSQ.
    // A = 47 e B = 47: B à frente por ter vencido a última bateria.
    expect(table(d)).toEqual(['1 B 47', '2 A 47', '3 C 20']);
    expect(d.provisional).toBe(false);
  });
});
