import { HeatEntry, HeatInfo, TimingEvent } from './timing.model';

/**
 * Dados FICTÍCIOS do escopo (PDF, página 6): Bateria 1 • MX2, cronometrista Ana Souza,
 * 8 pilotos, relógio em 08:42 de 20 min + 2 voltas. Até a API existir.
 */

const ELAPSED_AT_OPEN_MS = (11 * 60 + 18) * 1000; // 20:00 − 11:18 = 08:42 restantes

export function createMockHeat(now: number): HeatInfo {
  return {
    id: 'heat-mx2-b1',
    label: 'Bateria 1',
    categoryName: 'MX2',
    timekeeperName: 'Ana Souza',
    startedAt: now - ELAPSED_AT_OPEN_MS,
    durationMs: 20 * 60_000,
    extraLaps: 2,
    defaultPenaltyMs: 10_000,
    minLapMs: 45_000, // "volta mínima válida 00:45.000" do escopo
  };
}

export const MOCK_ENTRIES: HeatEntry[] = [
  { registrationId: 'reg-27', raceNumber: '27', pilotName: 'Rafael Menezes' },
  { registrationId: 'reg-14', raceNumber: '14', pilotName: 'Bruno Tavares' },
  { registrationId: 'reg-88', raceNumber: '88', pilotName: 'Lucas Andrade' },
  { registrationId: 'reg-05', raceNumber: '05', pilotName: 'Gabriela Nunes' },
  { registrationId: 'reg-63', raceNumber: '63', pilotName: 'Thiago Moura' },
  { registrationId: 'reg-31', raceNumber: '31', pilotName: 'Diego Fontes' },
  { registrationId: 'reg-72', raceNumber: '72', pilotName: 'Marcos Veloso' },
  { registrationId: 'reg-19', raceNumber: '19', pilotName: 'Henrique Leal' },
];

/** Voltas já dadas e tempo da última volta de cada piloto, como no PDF. */
const SEED: Record<string, { laps: number; lastLapMs: number }> = {
  'reg-27': { laps: 7, lastLapMs: 72_431 },
  'reg-14': { laps: 7, lastLapMs: 73_112 },
  'reg-88': { laps: 6, lastLapMs: 74_011 },
  'reg-05': { laps: 7, lastLapMs: 75_230 },
  'reg-63': { laps: 6, lastLapMs: 75_902 },
  'reg-31': { laps: 6, lastLapMs: 77_318 },
  'reg-72': { laps: 7, lastLapMs: 73_804 },
  'reg-19': { laps: 6, lastLapMs: 74_620 },
};

export const MOCK_DEVICE_ID = 'tablet-pista-1';

/**
 * Gera as passagens já registradas antes de abrir a tela. Determinístico (sem Math.random)
 * para a demonstração ser sempre igual. As últimas passagens caem perto do "agora", como numa
 * prova em andamento.
 */
export function buildSeedEvents(heat: HeatInfo): TimingEvent[] {
  const events: TimingEvent[] = [];
  const openedAt = heat.startedAt + ELAPSED_AT_OPEN_MS;
  MOCK_ENTRIES.forEach((entry, index) => {
    const { laps, lastLapMs } = SEED[entry.registrationId];
    // Última passagem ~1 min antes de abrir a tela: assim os primeiros toques da demonstração
    // dão voltas plausíveis (~1:00–1:15), e não "voltas" de poucos segundos.
    let at = openedAt - 62_000 - index * 2_000;
    const passes: number[] = [at];
    // Volta para trás a partir da última passagem. A volta mais recente tem exatamente o tempo do PDF.
    for (let lap = laps - 1; lap >= 1; lap--) {
      const lapMs = lap === laps - 1 ? lastLapMs : lastLapMs + ((lap * 37 + index * 13) % 23) * 100;
      at -= lapMs;
      passes.unshift(at);
    }
    passes.forEach((t, i) =>
      events.push({
        id: `seed-${entry.raceNumber}-${i + 1}`,
        heatId: heat.id,
        registrationId: entry.registrationId,
        type: 'LAP_PASS',
        deviceTimestamp: t,
        source: 'MANUAL',
        deviceId: MOCK_DEVICE_ID,
        createdBy: heat.timekeeperName,
        payload: {},
      }),
    );
  });
  return events.sort((a, b) => a.deviceTimestamp - b.deviceTimestamp);
}
