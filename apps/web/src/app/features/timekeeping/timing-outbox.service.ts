import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ConnectivityService } from '../../core/connectivity/connectivity.service';
import { TimingSession } from './timing-session.service';

/** Quantos eventos "subiram" antes de abrir a tela; os últimos ficam pendentes (PDF: 14). */
const PENDING_AT_START = 14;
const BATCH_SIZE = 5;
const FAKE_SEND_MS = 700;

/**
 * Fila de envio dos lançamentos ("outbox").
 *
 * **SIMULADA nesta fatia:** "enviar" só marca o evento como sincronizado depois de um atraso.
 * Na fase 5 vira: fila no IndexedDB (Dexie) + POST em lotes ordenados + servidor idempotente
 * (`ON CONFLICT (id) DO NOTHING`), sem mudar o que a tela lê (`pendingCount`).
 */
@Injectable()
export class TimingOutbox {
  private readonly session = inject(TimingSession);
  private readonly connectivity = inject(ConnectivityService);

  private readonly syncedIds = signal<ReadonlySet<string>>(
    new Set(this.session.events().slice(0, -PENDING_AT_START).map((e) => e.id)),
  );

  readonly pending = computed(() => this.session.events().filter((e) => !this.syncedIds().has(e.id)));
  readonly pendingCount = computed(() => this.pending().length);
  readonly online = this.connectivity.online;

  constructor() {
    // effect(): reage a "online" e "pendentes". Se há conexão e fila, agenda o envio do próximo lote.
    // onCleanup cancela o agendamento se algo mudar antes (ex.: caiu a internet de novo).
    effect((onCleanup) => {
      if (!this.online()) return;
      const batch = this.pending().slice(0, BATCH_SIZE);
      if (!batch.length) return;
      const timer = setTimeout(() => {
        this.syncedIds.update((ids) => new Set([...ids, ...batch.map((e) => e.id)]));
      }, FAKE_SEND_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
