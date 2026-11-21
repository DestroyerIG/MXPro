import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ConnectivityService } from '../../core/connectivity/connectivity.service';
import { type LiveRow, type LiveStandingsDto } from './live.model';
import { MOCK_ELAPSED_AT_OPEN_MS, mockStandings } from './live.mock';

export interface LiveRowView extends LiveRow {
  /** Subiu de posição na última atualização (a linha pisca rapidamente). */
  movedUp: boolean;
}

const POLL_MS = 1000;

/**
 * Fonte da classificação ao vivo para o telão.
 *
 * **Hoje:** consulta o "servidor fictício" (live.mock.ts) a cada segundo.
 * **Com a API (docs/arquitetura.md §5.4):** assina a sala `heat:{id}` por WebSocket, com reconexão automática
 * e fallback para polling HTTP. O que a tela lê (`standings`, `rows`, `stale`) não muda.
 *
 * Sem internet, a tela continua mostrando a última classificação recebida, marcada como desatualizada.
 */
@Injectable()
export class LiveFeed {
  private readonly connectivity = inject(ConnectivityService);
  private readonly openedAt = Date.now();
  private previousPositions = new Map<string, number>();

  private readonly _standings = signal<LiveStandingsDto | null>(null);
  readonly standings = this._standings.asReadonly();
  private readonly _rows = signal<readonly LiveRowView[]>([]);
  readonly rows = this._rows.asReadonly();

  /** Sem conexão: os dados na tela podem estar velhos. */
  readonly stale = computed(() => !this.connectivity.online());

  constructor() {
    this.receive(this.fetchMock());
    const timer = setInterval(() => {
      if (this.connectivity.online()) this.receive(this.fetchMock());
    }, POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private fetchMock(): LiveStandingsDto {
    const now = Date.now();
    return mockStandings(MOCK_ELAPSED_AT_OPEN_MS + (now - this.openedAt), now);
  }

  /** Recebe uma classificação nova (do servidor) e marca quem subiu de posição. */
  private receive(dto: LiveStandingsDto): void {
    const rows = dto.rows.map((r) => {
      const before = this.previousPositions.get(r.raceNumber);
      return { ...r, movedUp: before !== undefined && r.position < before };
    });
    // Só troca o signal se algo mudou de fato: evita redesenhar o telão a cada segundo à toa.
    const changed = JSON.stringify(dto.rows) !== JSON.stringify(this._standings()?.rows) ||
      JSON.stringify(dto.heat) !== JSON.stringify(this._standings()?.heat);
    if (!changed) return;
    this.previousPositions = new Map(dto.rows.map((r) => [r.raceNumber, r.position]));
    this._standings.set(dto);
    this._rows.set(rows);
  }
}
