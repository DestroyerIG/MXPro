import { formatCountdown, formatGap, formatPenalty, msToDisplay } from './race-time';

describe('msToDisplay', () => {
  it('formata tempo de volta com milésimos (padrão)', () => {
    expect(msToDisplay(72_431)).toBe('1:12.431');
    expect(msToDisplay(5_007)).toBe('0:05.007');
    expect(msToDisplay(3_600_000 + 61_000)).toBe('61:01.000');
  });

  it('com 1 casa decimal TRUNCA, nunca arredonda para cima (1:12.49 → 1:12.4)', () => {
    expect(msToDisplay(72_499, 1)).toBe('1:12.4');
    expect(msToDisplay(72_999, 1)).toBe('1:12.9');
  });

  it('recusa valores que não são milissegundos inteiros', () => {
    expect(() => msToDisplay(1.5)).toThrow();
    expect(() => msToDisplay(-1)).toThrow();
  });
});

describe('formatCountdown', () => {
  it('mostra mm:ss arredondando o segundo para cima (relógio de prova)', () => {
    expect(formatCountdown(522_000)).toBe('08:42');
    expect(formatCountdown(521_001)).toBe('08:42');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('nunca fica negativo', () => {
    expect(formatCountdown(-5_000)).toBe('00:00');
  });
});

describe('formatPenalty', () => {
  it('mostra segundos inteiros ou com décimos', () => {
    expect(formatPenalty(10_000)).toBe('+10 s');
    expect(formatPenalty(2_500)).toBe('+2,5 s');
  });
});

describe('formatGap', () => {
  it('líder mostra "-", como no escopo', () => {
    expect(formatGap({ kind: 'leader' })).toBe('-');
  });

  it('diferença em segundos com 1 casa, truncada', () => {
    expect(formatGap({ kind: 'time', ms: 2_899 })).toBe('+2.8');
    expect(formatGap({ kind: 'time', ms: 450 })).toBe('+0.4');
  });

  it('acima de 1 minuto usa m:ss.d', () => {
    expect(formatGap({ kind: 'time', ms: 75_250 })).toBe('+1:15.2');
  });

  it('voltas de atraso no singular e no plural', () => {
    expect(formatGap({ kind: 'laps', laps: 1 })).toBe('+1 volta');
    expect(formatGap({ kind: 'laps', laps: 3 })).toBe('+3 voltas');
  });
});
