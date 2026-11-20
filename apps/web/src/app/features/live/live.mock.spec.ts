import { MOCK_ELAPSED_AT_OPEN_MS, MOCK_TOTAL_LAPS, mockStandings } from './live.mock';

describe('mockStandings (servidor fictício da demonstração)', () => {
  it('abre como no PDF: líder na volta 7 de 10, posições 1..N em sequência', () => {
    const s = mockStandings(MOCK_ELAPSED_AT_OPEN_MS, 0);
    expect(s.heat).toMatchObject({ leaderLaps: 7, totalLaps: 10, finished: false });
    expect(s.rows.map((r) => r.position)).toEqual(s.rows.map((_, i) => i + 1));
    expect(s.rows[0].gap).toEqual({ kind: 'leader' });
  });

  it('ordem coerente: voltas decrescentes', () => {
    const { rows } = mockStandings(MOCK_ELAPSED_AT_OPEN_MS, 0);
    for (let i = 1; i < rows.length; i++) expect(rows[i].laps).toBeLessThanOrEqual(rows[i - 1].laps);
  });

  it('quem tem menos voltas mostra "+N voltas"; quem tem as mesmas, diferença em tempo positiva', () => {
    const { rows } = mockStandings(MOCK_ELAPSED_AT_OPEN_MS, 0);
    for (const r of rows.slice(1)) {
      if (r.laps < rows[0].laps) expect(r.gap).toEqual({ kind: 'laps', laps: rows[0].laps - r.laps });
      else expect(r.gap.kind === 'time' && r.gap.ms > 0).toBe(true);
    }
  });

  it('para no total de voltas e marca bandeirada', () => {
    const s = mockStandings(60 * 60_000, 0);
    expect(s.heat.finished).toBe(true);
    expect(Math.max(...s.rows.map((r) => r.laps))).toBe(MOCK_TOTAL_LAPS);
  });

  it('logo após a largada (ninguém com volta completa) não gera diferença inválida', () => {
    const { rows } = mockStandings(1_000, 0);
    expect(rows.every((r) => r.laps === 0 && r.gap.kind === 'leader')).toBe(true);
  });

  it('tempos são ms inteiros (regra do projeto)', () => {
    const { rows } = mockStandings(MOCK_ELAPSED_AT_OPEN_MS, 0);
    for (const r of rows) if (r.bestLapMs !== null) expect(Number.isInteger(r.bestLapMs)).toBe(true);
  });
});
