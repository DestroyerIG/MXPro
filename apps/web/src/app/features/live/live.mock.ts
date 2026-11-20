import { LiveRow, LiveStandingsDto } from './live.model';

/**
 * "SERVIDOR FICTÍCIO" do resultado ao vivo, só para demonstração enquanto não há API.
 * Simula uma bateria de MX2 (PDF p. 7) com 12 pilotos e devolve a classificação pronta.
 *
 * ATENÇÃO: este cálculo simplificado (voltas e ordem de passagem) NÃO é o motor de regras.
 * A classificação de verdade virá do servidor (packages/rules-engine) via WebSocket.
 */

interface MockPilot {
  raceNumber: string;
  name: string;
  team: string | null;
  baseLapMs: number;
}

const PILOTS: MockPilot[] = [
  { raceNumber: '27', name: 'Rafael Menezes', team: 'Equipe Exemplo', baseLapMs: 72_700 },
  { raceNumber: '14', name: 'Bruno Tavares', team: 'MX Sul', baseLapMs: 73_100 },
  { raceNumber: '72', name: 'Marcos Veloso', team: null, baseLapMs: 73_600 },
  { raceNumber: '05', name: 'Gabriela Nunes', team: 'Trilha Forte', baseLapMs: 74_200 },
  { raceNumber: '88', name: 'Lucas Andrade', team: 'MX Sul', baseLapMs: 79_400 },
  { raceNumber: '63', name: 'Thiago Moura', team: null, baseLapMs: 80_100 },
  { raceNumber: '19', name: 'Henrique Leal', team: 'Motos Serra', baseLapMs: 80_600 },
  { raceNumber: '31', name: 'Diego Fontes', team: 'Trilha Forte', baseLapMs: 81_500 },
  { raceNumber: '41', name: 'Caio Ribeiro', team: null, baseLapMs: 82_300 },
  { raceNumber: '09', name: 'André Castro', team: 'Equipe Exemplo', baseLapMs: 83_200 },
  { raceNumber: '55', name: 'Vitor Lima', team: 'Motos Serra', baseLapMs: 86_900 },
  { raceNumber: '73', name: 'Pedro Alves', team: null, baseLapMs: 90_400 },
];

export const MOCK_TOTAL_LAPS = 10;

/** Variação determinística da volta (±0,9 s, com milésimos), para a demonstração ser sempre igual. */
function lapTime(pilot: MockPilot, lap: number): number {
  const n = Number(pilot.raceNumber);
  return pilot.baseLapMs + (((lap * 7919 + n * 104_729) % 19) - 9) * 100 + ((lap * 131 + n * 17) % 97);
}

/** Horários de passagem acumulados de um piloto desde a largada (no máximo `totalLaps`). */
function passTimes(pilot: MockPilot, totalLaps: number): number[] {
  const times: number[] = [];
  let at = 0;
  for (let lap = 1; lap <= totalLaps; lap++) {
    at += lapTime(pilot, lap);
    times.push(at);
  }
  return times;
}

/** Tempo de prova para a demonstração abrir como no PDF: líder com 7 voltas. */
export const MOCK_ELAPSED_AT_OPEN_MS = 7 * 72_700 + 25_000;

/**
 * Classificação no instante `elapsedMs` desde a largada.
 * Ordem: mais voltas primeiro; empate em voltas → quem passou antes.
 * Diferença: mesmo nº de voltas → tempo atrás do líder naquela volta; menos voltas → "+N voltas".
 */
export function mockStandings(elapsedMs: number, now: number): LiveStandingsDto {
  const state = PILOTS.map((pilot) => {
    const all = passTimes(pilot, MOCK_TOTAL_LAPS);
    const done = all.filter((t) => t <= elapsedMs);
    const lapTimes = done.map((t, i) => t - (i === 0 ? 0 : done[i - 1]));
    return { pilot, all, laps: done.length, lastPassAt: done.at(-1) ?? 0, best: lapTimes.length ? Math.min(...lapTimes) : null };
  }).sort((a, b) => b.laps - a.laps || a.lastPassAt - b.lastPassAt);

  const leader = state[0];
  const rows: LiveRow[] = state.map((s, i) => ({
    position: i + 1,
    raceNumber: s.pilot.raceNumber,
    displayName: s.pilot.name,
    team: s.pilot.team,
    laps: s.laps,
    bestLapMs: s.best,
    gap:
      // Ninguém completou volta ainda: não há referência de tempo, todos aparecem como "-".
      i === 0 || leader.laps === 0 ? { kind: 'leader' }
      : s.laps < leader.laps ? { kind: 'laps', laps: leader.laps - s.laps }
      : { kind: 'time', ms: s.lastPassAt - leader.all[s.laps - 1] },
  }));

  return {
    heat: {
      id: 'heat-mx2-b1',
      categoryName: 'MX2',
      label: 'Bateria 1',
      leaderLaps: leader.laps,
      totalLaps: MOCK_TOTAL_LAPS,
      finished: leader.laps >= MOCK_TOTAL_LAPS,
    },
    rows,
    sponsors: [],
    updatedAt: now,
  };
}
