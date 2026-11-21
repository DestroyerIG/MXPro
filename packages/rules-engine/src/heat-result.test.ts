import { beforeEach, describe, expect, it } from 'vitest';
import { MOTOCROSS_TEMPLATE, type RaceConfig } from './config.js';
import { type HeatEntryInput, type HeatResult, type TimingEventInput, computeHeatResult } from './heat-result.js';

// ─── Montagem dos cenários ────────────────────────────────────────────────────────────────
// Horários em SEGUNDOS desde a largada (fica fácil de ler); o motor recebe ms desde 1970.

const START = 1_800_000_000_000;
const at = (seconds: number) => START + seconds * 1000;

let seq = 0;
beforeEach(() => {
  seq = 0;
});
function ev(type: TimingEventInput['type'], registrationId: string | null, seconds: number, payload?: TimingEventInput['payload']): TimingEventInput {
  return { id: `e${String(++seq).padStart(4, '0')}`, type, registrationId, deviceTimestamp: at(seconds), payload };
}
const pass = (reg: string, seconds: number) => ev('LAP_PASS', reg, seconds);
/** Várias passagens de um piloto. */
const passes = (reg: string, ...seconds: number[]) => seconds.map((s) => pass(reg, s));
const flag = (seconds: number) => ev('FINISH_FLAG', null, seconds);
const penalty = (reg: string, seconds: number, penaltyMs: number) => ev('PENALTY', reg, seconds, { penaltyMs });
const dsq = (reg: string, seconds: number) => ev('DSQ', reg, seconds);
const undo = (target: TimingEventInput, seconds: number) => ev('UNDO', null, seconds, { undoneEventId: target.id });

const CONFIG: RaceConfig = { ...MOTOCROSS_TEMPLATE, minLapMs: 45_000, minLeaderLapsPct: 50 };
const MX1: HeatEntryInput[] = ['A', 'B', 'C'].map((registrationId) => ({ registrationId, categoryId: 'mx1' }));

function run(events: TimingEventInput[], opts: { config?: RaceConfig; entries?: HeatEntryInput[] } = {}): HeatResult {
  return computeHeatResult({ config: opts.config ?? CONFIG, startedAt: START, entries: opts.entries ?? MX1, events });
}
/** Classificação resumida: "posição|status piloto voltas". */
function table(result: HeatResult, categoryId = 'mx1'): string[] {
  const category = result.categories.find((c) => c.categoryId === categoryId)!;
  return category.rows.map((r) => `${r.position ?? r.status} ${r.registrationId} ${r.laps}`);
}
const row = (result: HeatResult, reg: string) => result.categories.flatMap((c) => c.rows).find((r) => r.registrationId === reg)!;

// ─── Classificação básica ─────────────────────────────────────────────────────────────────

describe('classificação', () => {
  it('mais voltas primeiro; com as mesmas voltas, quem cruzou antes', () => {
    const result = run([...passes('A', 60, 120), ...passes('B', 58, 125), ...passes('C', 70, 140, 210)]);
    expect(table(result)).toEqual(['1 C 3', '2 A 2', '3 B 2']);
  });

  it('diferença para o líder: tempo (mesmas voltas) ou "+N voltas"', () => {
    const result = run([...passes('A', 60, 120, 180), ...passes('B', 61, 122, 183.5), ...passes('C', 90, 180)]);
    expect(row(result, 'A').gap).toEqual({ type: 'LEADER' });
    expect(row(result, 'B').gap).toEqual({ type: 'TIME', ms: 3500 });
    expect(row(result, 'C').gap).toEqual({ type: 'LAPS', laps: 1 });
  });

  it('tempo de cada volta, melhor volta e em qual volta foi', () => {
    const result = run(passes('A', 62, 119, 178));
    expect(row(result, 'A')).toMatchObject({ lapTimesMs: [62_000, 57_000, 59_000], bestLapMs: 57_000, bestLapNumber: 2, totalTimeMs: 178_000 });
  });

  it('empate exato: ordem estável pelo id da inscrição (o resultado nunca "pisca")', () => {
    // Inscritos em ordem inversa: o desempate tem de vir do id, não da ordem da lista recebida.
    const entries = [...MX1].reverse();
    const result = run([...passes('B', 60, 120), ...passes('A', 60, 120)], { entries });
    expect(table(result)).toEqual(['1 A 2', '2 B 2', 'DNS C 0']);
  });
});

// ─── Volta mínima (ADR 0003) ──────────────────────────────────────────────────────────────

describe('volta abaixo da mínima', () => {
  it('toque duplo: a passagem é ignorada e a volta seguinte conta da última válida', () => {
    const result = run(passes('A', 60, 62, 120));
    expect(row(result, 'A')).toMatchObject({ laps: 2, lapTimesMs: [60_000, 60_000] });
    expect(result.ignoredPasses).toEqual([
      { eventId: 'e0002', registrationId: 'A', reason: 'BELOW_MIN_LAP', at: at(62), sinceLastValidMs: 2000 },
    ]);
  });

  it('volta exatamente igual à mínima conta', () => {
    expect(run(passes('A', 45, 90)).categories[0]!.rows[0]!.laps).toBe(2);
  });

  it('passagem antes da largada (relógio do aparelho adiantado) não vira volta', () => {
    const result = run(passes('A', -5, 60));
    expect(row(result, 'A').laps).toBe(1);
  });
});

// ─── Correções: desfazer, duplicados, ordem ───────────────────────────────────────────────

describe('correções e sincronização', () => {
  it('passagem desfeita não conta', () => {
    const wrong = pass('A', 60);
    const result = run([wrong, undo(wrong, 61), ...passes('A', 61.5, 130)]);
    expect(row(result, 'A')).toMatchObject({ laps: 2, lapTimesMs: [61_500, 68_500] });
  });

  it('UNDO de um UNDO é ignorado (a pista só desfaz lançamentos)', () => {
    const p = pass('A', 60);
    const u = undo(p, 61);
    expect(row(run([p, u, undo(u, 62)]), 'A').laps).toBe(0);
  });

  it('o mesmo evento chegando duas vezes (reenvio offline) conta uma vez', () => {
    const events = passes('A', 60, 120);
    expect(row(run([...events, ...events.map((e) => ({ ...e }))]), 'A').laps).toBe(2);
  });

  it('eventos fora de ordem (sincronização atrasada) dão o MESMO resultado', () => {
    const events = [
      ...passes('A', 60, 62, 120, 181), ...passes('B', 61, 125, 190), ...passes('C', 90),
      penalty('B', 100, 10_000), flag(180),
    ];
    const expected = run(events);
    const shuffled = [...events].reverse();
    const rotated = [...events.slice(5), ...events.slice(0, 5)];
    expect(run(shuffled)).toEqual(expected);
    expect(run(rotated)).toEqual(expected);
  });

  it('evento de piloto que não está na bateria é ignorado', () => {
    const result = run([...passes('A', 60), pass('INTRUSO', 60)]);
    expect(result.categories[0]!.rows.map((r) => r.registrationId)).not.toContain('INTRUSO');
  });
});

// ─── Penalidade e desclassificação ────────────────────────────────────────────────────────

describe('penalidade em tempo', () => {
  it('soma ao tempo e reordena quem tem as mesmas voltas', () => {
    const result = run([...passes('A', 60, 120), ...passes('B', 61, 125), penalty('A', 90, 10_000)]);
    expect(table(result)).toEqual(['1 B 2', '2 A 2', 'DNS C 0']);
    expect(row(result, 'A')).toMatchObject({ penaltyMs: 10_000, totalTimeMs: 130_000, gap: { type: 'TIME', ms: 5000 } });
  });

  it('NÃO tira posição de quem tem mais voltas', () => {
    const result = run([...passes('A', 60, 120, 180), ...passes('B', 61, 125), penalty('A', 90, 120_000)]);
    expect(table(result).slice(0, 2)).toEqual(['1 A 3', '2 B 2']);
  });

  it('penalidades se acumulam; penalidade desfeita sai do tempo', () => {
    const p2 = penalty('A', 95, 10_000);
    const result = run([...passes('A', 60), penalty('A', 90, 10_000), p2, undo(p2, 96)]);
    expect(row(result, 'A').penaltyMs).toBe(10_000);
  });

  it('penalidade dada depois da bandeirada (revisão) ainda vale', () => {
    const result = run([...passes('A', 60, 120), ...passes('B', 61, 125), flag(119), penalty('A', 300, 10_000)]);
    expect(table(result).slice(0, 2)).toEqual(['1 B 2', '2 A 2']);
  });
});

describe('desclassificação', () => {
  it('vai para o fim, sem posição; os demais sobem', () => {
    const result = run([...passes('A', 60, 120, 180), ...passes('B', 61, 125), ...passes('C', 70), dsq('A', 150)]);
    expect(table(result)).toEqual(['1 B 2', '2 C 1', 'DSQ A 3']);
    expect(row(result, 'A').gap).toBeNull();
  });

  it('desclassificação desfeita: volta ao normal', () => {
    const d = dsq('A', 150);
    expect(table(run([...passes('A', 60, 120), ...passes('B', 61), d, undo(d, 151)]))[0]).toBe('1 A 2');
  });

  it('o desclassificado não conta como "vencedor" para o mínimo de voltas', () => {
    // A (DSQ) fez 10 voltas; sem ele, o vencedor B fez 2: C com 1 volta é classificado (50% de 2).
    const aLaps = Array.from({ length: 10 }, (_, i) => 60 * (i + 1));
    const result = run([...passes('A', ...aLaps), dsq('A', 100), ...passes('B', 61, 125), ...passes('C', 70)]);
    expect(table(result)).toEqual(['1 B 2', '2 C 1', 'DSQ A 10']);
  });
});

// ─── Término ──────────────────────────────────────────────────────────────────────────────

describe('bandeirada "tempo + N voltas"', () => {
  // A lidera; a bandeirada é marcada aos 179 s, logo antes de A cruzar (180 s).
  const race = () => [
    ...passes('A', 60, 120, 180, 240), // 240: depois de terminar, não conta
    ...passes('B', 70, 140, 210), // 210: primeira passagem depois da bandeirada → termina com 3
    ...passes('C', 100, 200), // retardatário: termina aos 200 s com 2 voltas
    flag(179),
  ];

  it('cada piloto termina na primeira passagem a partir da bandeirada', () => {
    const result = run(race());
    expect(result).toMatchObject({ finished: true, flagAt: at(179) });
    expect(table(result)).toEqual(['1 A 3', '2 B 3', '3 C 2']);
    expect(['A', 'B', 'C'].map((r) => row(result, r).finished)).toEqual([true, true, true]);
    expect(row(result, 'C').gap).toEqual({ type: 'LAPS', laps: 1 });
  });

  it('passagens depois de terminar não contam e ficam registradas', () => {
    const result = run(race());
    expect(row(result, 'A').laps).toBe(3);
    expect(result.ignoredPasses).toEqual([
      expect.objectContaining({ registrationId: 'A', reason: 'AFTER_FINISH', at: at(240) }),
    ]);
  });

  it('sem bandeirada: bateria em andamento, classificação provisória', () => {
    const result = run(race().filter((e) => e.type !== 'FINISH_FLAG'));
    expect(result).toMatchObject({ finished: false, flagAt: null });
    expect(table(result)).toEqual(['1 A 4', '2 B 3', '3 C 2']);
    expect(row(result, 'A').finished).toBe(false);
  });

  it('bandeirada desfeita (marcada por engano): a bateria volta a estar em andamento', () => {
    const f = flag(50);
    expect(run([...passes('A', 60), f, undo(f, 51)]).finished).toBe(false);
  });
});

describe('número fixo de voltas', () => {
  const FIXED: RaceConfig = { ...CONFIG, finish: { type: 'FIXED_LAPS', laps: 3 } };

  it('sem o evento de bandeirada: termina quando o primeiro completa as voltas', () => {
    const result = run([...passes('A', 60, 120, 180, 240), ...passes('B', 70, 140, 210), ...passes('C', 100, 200)], { config: FIXED });
    expect(result).toMatchObject({ finished: true, flagAt: at(180) });
    expect(table(result)).toEqual(['1 A 3', '2 B 3', '3 C 2']);
  });

  it('com o evento de bandeirada, vale o evento', () => {
    const result = run([...passes('A', 60, 120), flag(100)], { config: FIXED });
    expect(result.flagAt).toBe(at(100));
    expect(row(result, 'A').laps).toBe(2);
  });
});

// ─── Quem é classificado (ADR 0003) ───────────────────────────────────────────────────────

describe('mínimo de voltas do vencedor', () => {
  it('abaixo de 50% das voltas do vencedor: não classificado, sem posição', () => {
    // Vencedor A: 4 voltas → mínimo 2. B com 2: classificado. C com 1: não classificado.
    const result = run([...passes('A', 60, 120, 180, 240), ...passes('B', 70, 140), ...passes('C', 70), flag(239)]);
    expect(table(result)).toEqual(['1 A 4', '2 B 2', 'NOT_CLASSIFIED C 1']);
    expect(result.categories[0]!.minLapsToClassify).toBe(2);
  });

  it('abandono com o mínimo de voltas: classificado pela posição, sem bandeirada', () => {
    const result = run([...passes('A', 60, 120, 180, 240), ...passes('B', 70, 140, 210), flag(239)]);
    expect(row(result, 'B')).toMatchObject({ status: 'CLASSIFIED', position: 2, finished: false });
  });

  it('sem nenhuma volta: DNS (fica depois dos não classificados e antes dos desclassificados)', () => {
    const entries = [...MX1, { registrationId: 'D', categoryId: 'mx1' }];
    const result = run([...passes('A', 60, 120, 180, 240), ...passes('B', 70), dsq('D', 50), ...passes('D', 65)], { entries });
    expect(table(result)).toEqual(['1 A 4', 'NOT_CLASSIFIED B 1', 'DNS C 0', 'DSQ D 1']);
  });

  it('percentual configurável: com 0%, uma volta basta', () => {
    const result = run([...passes('A', 60, 120, 180, 240), ...passes('C', 70)], { config: { ...CONFIG, minLeaderLapsPct: 0 } });
    expect(row(result, 'C').position).toBe(2);
  });
});

// ─── Bateria com mais de uma categoria ────────────────────────────────────────────────────

describe('bateria que junta categorias', () => {
  const entries: HeatEntryInput[] = [
    { registrationId: 'A', categoryId: 'mx2' },
    { registrationId: 'M1', categoryId: 'master' },
    { registrationId: 'B', categoryId: 'mx2' },
    { registrationId: 'M2', categoryId: 'master' },
  ];

  it('cada categoria tem sua classificação, seu líder e seu mínimo de voltas', () => {
    const result = run(
      [...passes('A', 60, 120, 180, 240), ...passes('B', 65, 130, 195), ...passes('M1', 75, 150), ...passes('M2', 80), flag(239)],
      { entries },
    );
    expect(result.categories.map((c) => c.categoryId)).toEqual(['mx2', 'master']);
    expect(table(result, 'mx2')).toEqual(['1 A 4', '2 B 3']);
    // Na Master o vencedor tem 2 voltas: mínimo 1 → M2 é classificado, mesmo longe do líder geral.
    expect(table(result, 'master')).toEqual(['1 M1 2', '2 M2 1']);
    expect(row(result, 'M1').gap).toEqual({ type: 'LEADER' });
  });
});
