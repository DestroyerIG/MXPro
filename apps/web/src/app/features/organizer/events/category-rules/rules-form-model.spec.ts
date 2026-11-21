import { MOTOCROSS_TEMPLATE } from '@mxpro/rules-engine';
import { parseCount, parseDuration, parseSeconds, toConfig, toFormModel } from './rules-form-model';

describe('modelo do formulário de regras', () => {
  it('modelo pronto vira os textos do PDF (20 minutos, 0:45.000, +10 s)', () => {
    const m = toFormModel(MOTOCROSS_TEMPLATE);
    expect(m).toMatchObject({
      start: 'GRID_DRAW',
      finishType: 'TIME_PLUS_LAPS',
      duration: '20',
      extraLaps: '2',
      heatsPerCategory: '2',
      minLap: '0:45.000',
      penalty: '10',
      minLeaderLapsPct: '50',
      tiebreak: 'LAST_HEAT',
      reason: '',
    });
    expect(m.points.slice(0, 6)).toEqual(['25', '22', '20', '18', '16', '15']);
  });

  it('ida e volta: o formulário sem mudanças devolve a mesma configuração', () => {
    expect(toConfig(toFormModel(MOTOCROSS_TEMPLATE))).toEqual(MOTOCROSS_TEMPLATE);
    const odd = { ...MOTOCROSS_TEMPLATE, finish: { type: 'TIME_PLUS_LAPS' as const, durationMs: 15 * 60_000 + 30_000, extraLaps: 1 }, defaultPenaltyMs: 2_500, minLapMs: 52_431 };
    expect(toFormModel(odd)).toMatchObject({ duration: '15:30', penalty: '2,5', minLap: '0:52.431' });
    expect(toConfig(toFormModel(odd))).toEqual(odd);
  });

  it('número fixo de voltas', () => {
    const m = { ...toFormModel(MOTOCROSS_TEMPLATE), finishType: 'FIXED_LAPS' as const, laps: '12' };
    expect(toConfig(m)?.finish).toEqual({ type: 'FIXED_LAPS', laps: 12 });
    // E ao abrir uma configuração de voltas fixas, o outro tipo ganha valores para quem trocar.
    expect(toFormModel({ ...MOTOCROSS_TEMPLATE, finish: { type: 'FIXED_LAPS', laps: 12 } })).toMatchObject({ laps: '12', duration: '20', extraLaps: '2' });
  });

  it('texto que não dá para ler: toConfig devolve null', () => {
    const base = toFormModel(MOTOCROSS_TEMPLATE);
    expect(toConfig({ ...base, minLap: 'rápido' })).toBeNull();
    expect(toConfig({ ...base, points: ['25', 'x'] })).toBeNull();
    expect(toConfig({ ...base, duration: '' })).toBeNull();
  });

  it('leitura de duração, segundos e contagens', () => {
    expect(parseDuration('20')).toBe(1_200_000);
    expect(parseDuration('20:30')).toBe(1_230_000);
    expect(parseDuration('20:75')).toBeNull();
    expect(parseSeconds('10')).toBe(10_000);
    expect(parseSeconds('2,5')).toBe(2_500);
    expect(parseSeconds('-1')).toBeNull();
    expect(parseCount('3')).toBe(3);
    expect(parseCount('3,5')).toBeNull();
    expect(parseCount('')).toBeNull();
  });
});
