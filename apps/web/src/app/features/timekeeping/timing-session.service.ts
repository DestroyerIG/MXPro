import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { SessionService } from '../../core/session/session.service';
import { HeatInfo, TimingEvent, TimingEventType } from './timing.model';
import { MOCK_DEVICE_ID, MOCK_ENTRIES, buildSeedEvents, createMockHeat } from './timing.mock';
import { isFinished, lastUndoable, recentPasses, summarizePilots } from './timing-log';

const RECENT_PASSES = 7;

/**
 * Estado de UMA bateria sendo cronometrada neste aparelho.
 *
 * - `events` é o log append-only: a única coisa que se escreve. Tudo o mais é `computed`.
 * - Registrar algo = acrescentar evento com UUID do aparelho e horário do toque.
 *
 * Sem `providedIn: 'root'` de propósito: é fornecido pelo componente da tela (`providers: [...]`),
 * então nasce e morre com ela. Em outra bateria, outra instância.
 *
 * Hoje os dados vêm do mock e ficam só em memória. Na fase 5 o log é gravado no IndexedDB
 * ANTES de atualizar a tela (docs/arquitetura.md §2.1) e carregado de lá ao reabrir.
 */
@Injectable()
export class TimingSession {
  private readonly createdBy = inject(SessionService).user()?.name ?? 'Cronometrista';

  readonly heat = signal<HeatInfo>(createMockHeat(Date.now()));
  readonly entries = signal(MOCK_ENTRIES);
  private readonly _events = signal<readonly TimingEvent[]>(buildSeedEvents(this.heat()));
  readonly events = this._events.asReadonly();

  /** Relógio da tela, atualizado a cada segundo. */
  readonly now = signal(Date.now());

  readonly pilots = computed(() => summarizePilots(this.entries(), this._events(), this.heat().startedAt));
  readonly passes = computed(() =>
    recentPasses(this.entries(), this._events(), this.heat().startedAt, RECENT_PASSES),
  );
  readonly finished = computed(() => isFinished(this._events()));
  readonly canUndo = computed(() => lastUndoable(this._events()) !== undefined);
  /** Piloto da última passagem válida (cartão destacado em laranja). */
  readonly lastPassRegistrationId = computed(() => {
    const id = this.passes()[0]?.eventId;
    return this._events().find((e) => e.id === id)?.registrationId ?? null;
  });
  readonly remainingMs = computed(() => this.heat().startedAt + this.heat().durationMs - this.now());

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    // DestroyRef: avisa quando a tela (dona deste service) é destruída, para parar o relógio.
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  recordLap(registrationId: string): TimingEvent {
    return this.append('LAP_PASS', registrationId);
  }

  applyPenalty(registrationId: string): TimingEvent {
    return this.append('PENALTY', registrationId, { penaltyMs: this.heat().defaultPenaltyMs });
  }

  disqualify(registrationId: string): TimingEvent {
    return this.append('DSQ', registrationId, { reason: 'Desclassificação registrada na pista' });
  }

  finishFlag(): TimingEvent {
    return this.append('FINISH_FLAG', null);
  }

  /** Desfaz a última ação válida. Devolve o evento desfeito, ou undefined se não havia nada. */
  undoLast(): TimingEvent | undefined {
    const target = lastUndoable(this._events());
    if (target) this.undo(target.id);
    return target;
  }

  /** Desfaz um evento específico (ex.: pelo "Desfazer" do aviso). Gera UNDO; nada é apagado. */
  undo(eventId: string): void {
    const target = this._events().find((e) => e.id === eventId);
    const alreadyUndone = this._events().some((e) => e.type === 'UNDO' && e.payload.undoneEventId === eventId);
    if (!target || target.type === 'UNDO' || alreadyUndone) return;
    this.append('UNDO', target.registrationId, { undoneEventId: eventId, reason: 'Desfeito pelo cronometrista' });
  }

  raceNumberOf(registrationId: string | null): string {
    return this.entries().find((e) => e.registrationId === registrationId)?.raceNumber ?? '';
  }

  private append(type: TimingEventType, registrationId: string | null, payload: TimingEvent['payload'] = {}): TimingEvent {
    const event: TimingEvent = {
      id: crypto.randomUUID(),
      heatId: this.heat().id,
      registrationId,
      type,
      deviceTimestamp: Date.now(),
      source: 'MANUAL',
      deviceId: MOCK_DEVICE_ID,
      createdBy: this.createdBy,
      payload,
    };
    // update() devolve uma lista NOVA (imutável): o signal percebe a mudança e os computed recalculam.
    this._events.update((list) => [...list, event]);
    return event;
  }
}
