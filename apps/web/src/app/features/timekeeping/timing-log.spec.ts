import { type HeatEntry, type TimingEvent, type TimingEventType } from './timing.model';
import { isFinished, lastUndoable, recentPasses, summarizePilots } from './timing-log';

const START = 1_000_000;
const entries: HeatEntry[] = [
  { registrationId: 'r27', raceNumber: '27', pilotName: 'Rafael Menezes' },
  { registrationId: 'r14', raceNumber: '14', pilotName: 'Bruno Tavares' },
];

let seq = 0;
function ev(type: TimingEventType, registrationId: string | null, at: number, payload: TimingEvent['payload'] = {}): TimingEvent {
  return {
    id: `e${++seq}`, heatId: 'h1', registrationId, type, deviceTimestamp: START + at,
    source: 'MANUAL', deviceId: 'd1', createdBy: 'Ana', payload,
  };
}
const undo = (target: TimingEvent, at: number) => ev('UNDO', target.registrationId, at, { undoneEventId: target.id });

describe('summarizePilots', () => {
  it('sem eventos: 0 voltas e sem tempo', () => {
    const [p] = summarizePilots(entries, [], START);
    expect(p).toMatchObject({ laps: 0, lastLapMs: null, bestLapMs: null, penaltyMs: 0, disqualified: false });
  });

  it('conta voltas e calcula tempo de volta pela diferença entre passagens (1ª volta desde a largada)', () => {
    const events = [ev('LAP_PASS', 'r27', 75_000), ev('LAP_PASS', 'r27', 147_431)];
    const [p] = summarizePilots(entries, events, START);
    expect(p).toMatchObject({ laps: 2, lastLapMs: 72_431, bestLapMs: 72_431 });
  });

  it('ordena por horário do toque, mesmo que os eventos cheguem fora de ordem (vários aparelhos)', () => {
    const events = [ev('LAP_PASS', 'r27', 147_431), ev('LAP_PASS', 'r27', 75_000)];
    expect(summarizePilots(entries, events, START)[0].lastLapMs).toBe(72_431);
  });

  it('volta desfeita não conta, e o evento original continua na lista (nada é apagado)', () => {
    const lap1 = ev('LAP_PASS', 'r27', 75_000);
    const lap2 = ev('LAP_PASS', 'r27', 80_000); // toque errado
    const events = [lap1, lap2, undo(lap2, 81_000)];
    expect(summarizePilots(entries, events, START)[0]).toMatchObject({ laps: 1, lastLapMs: 75_000 });
    expect(events).toHaveLength(3);
  });

  it('soma penalidades e marca desclassificação, só do piloto certo', () => {
    const events = [
      ev('PENALTY', 'r27', 10_000, { penaltyMs: 10_000 }),
      ev('PENALTY', 'r27', 20_000, { penaltyMs: 10_000 }),
      ev('DSQ', 'r14', 30_000),
    ];
    const [a, b] = summarizePilots(entries, events, START);
    expect(a).toMatchObject({ penaltyMs: 20_000, disqualified: false });
    expect(b).toMatchObject({ penaltyMs: 0, disqualified: true });
  });

  it('desclassificação desfeita volta ao normal', () => {
    const dsq = ev('DSQ', 'r14', 30_000);
    expect(summarizePilots(entries, [dsq, undo(dsq, 31_000)], START)[1].disqualified).toBe(false);
  });
});

describe('recentPasses', () => {
  it('lista as passagens mais recentes primeiro, com nº da volta e tempo', () => {
    const events = [ev('LAP_PASS', 'r27', 75_000), ev('LAP_PASS', 'r14', 76_000), ev('LAP_PASS', 'r27', 147_431)];
    expect(recentPasses(entries, events, START, 10)).toEqual([
      expect.objectContaining({ raceNumber: '27', lap: 2, lapMs: 72_431 }),
      expect.objectContaining({ raceNumber: '14', lap: 1, lapMs: 76_000 }),
      expect.objectContaining({ raceNumber: '27', lap: 1, lapMs: 75_000 }),
    ]);
  });

  it('respeita o limite', () => {
    const events = [1, 2, 3].map((i) => ev('LAP_PASS', 'r27', i * 70_000));
    expect(recentPasses(entries, events, START, 2)).toHaveLength(2);
  });
});

describe('lastUndoable', () => {
  it('é a última ação registrada neste log que ainda vale', () => {
    const a = ev('LAP_PASS', 'r27', 75_000);
    const b = ev('PENALTY', 'r14', 76_000, { penaltyMs: 10_000 });
    expect(lastUndoable([a, b])?.id).toBe(b.id);
    expect(lastUndoable([a, b, undo(b, 77_000)])?.id).toBe(a.id);
  });

  it('não há o que desfazer em log vazio ou só com desfeitos', () => {
    const a = ev('LAP_PASS', 'r27', 75_000);
    expect(lastUndoable([])).toBeUndefined();
    expect(lastUndoable([a, undo(a, 76_000)])).toBeUndefined();
  });
});

describe('isFinished', () => {
  it('fica verdadeiro com a bandeirada e volta a falso se ela for desfeita', () => {
    const flag = ev('FINISH_FLAG', null, 600_000);
    expect(isFinished([flag])).toBe(true);
    expect(isFinished([flag, undo(flag, 601_000)])).toBe(false);
  });
});
