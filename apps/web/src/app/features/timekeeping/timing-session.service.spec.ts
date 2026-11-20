import { TestBed } from '@angular/core/testing';
import { TimingSession } from './timing-session.service';

describe('TimingSession', () => {
  function create() {
    TestBed.configureTestingModule({ providers: [TimingSession] });
    return TestBed.inject(TimingSession);
  }

  it('cada registro é um evento novo com UUID, horário do toque e autor', () => {
    const s = create();
    const before = s.events().length;
    const e = s.recordLap('reg-27');
    expect(s.events()).toHaveLength(before + 1);
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e).toMatchObject({ type: 'LAP_PASS', registrationId: 'reg-27', source: 'MANUAL' });
    expect(Math.abs(e.deviceTimestamp - Date.now())).toBeLessThan(1000);
  });

  it('desfazer acrescenta UNDO apontando para o evento; o original continua no log', () => {
    const s = create();
    const lap = s.recordLap('reg-27');
    s.undoLast();
    const undo = s.events().at(-1)!;
    expect(undo).toMatchObject({ type: 'UNDO', payload: { undoneEventId: lap.id } });
    expect(s.events().some((e) => e.id === lap.id)).toBe(true);
  });

  it('desfazer o mesmo evento duas vezes não gera UNDO duplicado', () => {
    const s = create();
    const lap = s.recordLap('reg-27');
    s.undo(lap.id);
    const count = s.events().length;
    s.undo(lap.id);
    expect(s.events()).toHaveLength(count);
  });

  it('penalidade usa o valor padrão da prova', () => {
    const s = create();
    expect(s.applyPenalty('reg-14').payload.penaltyMs).toBe(10_000);
  });
});
