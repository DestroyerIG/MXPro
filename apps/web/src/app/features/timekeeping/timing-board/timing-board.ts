import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, computed, inject, isDevMode, signal, viewChild } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { formatCountdown, formatPenalty, msToDisplay } from '../../../shared/format/race-time';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { PilotCard, type TapMode } from '../pilot-card/pilot-card';
import { type TimingEvent } from '../timing.model';
import { TimingOutbox } from '../timing-outbox.service';
import { TimingSession } from '../timing-session.service';

/** Começa "offline" para a demonstração bater com o PDF (OFFLINE – 14 pendentes). Só no mock. */
const DEMO_START_OFFLINE = true;
/** Tempo do aviso de toque repetido (mesmo do "Desfazer" padrão). */
const SUSPECT_HIGHLIGHT_MS = 5_000;

/**
 * Tela de cronometragem para tablet (docs/arquitetura.md §4.3, PDF página 6).
 *
 * Regras de interação da pista:
 * - Um toque no cartão = uma passagem. Sem "tem certeza?": quem corrige é o "Desfazer".
 * - Penalidade e Desclassificar ARMAM o próximo toque (o cartão tocado recebe a ação).
 *   Tocar de novo no botão ou Esc desarma.
 * - Penalidade, DSQ e bandeirada mostram aviso com "Desfazer". Passagem não mostra aviso:
 *   a confirmação é o cartão laranja + a lista de últimas passagens (aviso a cada volta cobriria a tela).
 */
@Component({
  selector: 'app-timing-board',
  imports: [Button, StatusBadge, PilotCard, ConfirmDialog],
  templateUrl: './timing-board.html',
  // providers no componente: estas instâncias pertencem a ESTA tela e somem com ela.
  providers: [TimingSession, TimingOutbox],
  host: { '(document:keydown.escape)': 'mode.set("lap")' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimingBoard {
  protected readonly session = inject(TimingSession);
  protected readonly outbox = inject(TimingOutbox);
  private readonly connectivity = inject(ConnectivityService);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(SessionService);
  private readonly logoutDialog = viewChild.required<ConfirmDialog>('logoutDialog');

  protected readonly isDev = isDevMode();
  protected readonly simulateOffline = this.connectivity.simulateOffline;
  protected readonly mode = signal<TapMode>('lap');
  /** Piloto cuja última passagem ficou abaixo da volta mínima (cartão em âmbar enquanto o aviso dura). */
  protected readonly suspectRegistrationId = signal<string | null>(null);
  private suspectTimer?: ReturnType<typeof setTimeout>;

  protected readonly heatTitle = computed(() => {
    const h = this.session.heat();
    return `${h.label.toUpperCase()} • ${h.categoryName}`;
  });
  protected readonly clock = computed(() => formatCountdown(this.session.remainingMs()));
  protected readonly clockHint = computed(() => {
    const extra = this.session.heat().extraLaps;
    return this.session.remainingMs() > 0 ? `restantes + ${extra} voltas` : `tempo esgotado: + ${extra} voltas`;
  });
  protected readonly penaltyLabel = computed(() => formatPenalty(this.session.heat().defaultPenaltyMs));
  protected readonly armedMessage = computed(() =>
    this.mode() === 'penalty' ? `Toque no piloto que recebe a penalidade (${this.penaltyLabel()}).`
    : this.mode() === 'dsq' ? 'Toque no piloto que será desclassificado.'
    : '',
  );
  protected readonly passes = computed(() =>
    this.session.passes().map((p) => ({ ...p, time: msToDisplay(p.lapMs) })),
  );

  constructor() {
    if (DEMO_START_OFFLINE) this.connectivity.simulateOffline.set(true);
    // Avisos aparecem acima da barra de ações (ver styles.css), para não cobrir os botões.
    const body = inject(DOCUMENT).body;
    body.classList.add('has-action-bar');
    // Ao sair da tela: a simulação é global (ConnectivityService é root) e a classe é do <body>.
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.suspectTimer);
      this.connectivity.simulateOffline.set(false);
      body.classList.remove('has-action-bar');
    });
  }

  protected onCardTap(registrationId: string): void {
    const mode = this.mode();
    if (mode === 'lap') {
      const event = this.session.recordLap(registrationId);
      this.checkRepeatedTap(registrationId, event);
      return;
    }
    const number = this.session.raceNumberOf(registrationId);
    const event =
      mode === 'penalty' ? this.session.applyPenalty(registrationId) : this.session.disqualify(registrationId);
    this.mode.set('lap');
    this.notifyWithUndo(
      mode === 'penalty' ? `Penalidade de ${this.penaltyLabel()} aplicada ao #${number}` : `#${number} desclassificado`,
      event,
    );
  }

  protected toggleMode(mode: Exclude<TapMode, 'lap'>): void {
    this.mode.update((current) => (current === mode ? 'lap' : mode));
  }

  protected undoLast(): void {
    this.mode.set('lap');
    this.suspectRegistrationId.set(null);
    const undone = this.session.undoLast();
    if (undone) this.toasts.show(`Desfeito: ${this.describe(undone)}`, { tone: 'ok', durationMs: 3000 });
  }

  protected finishFlag(): void {
    this.mode.set('lap');
    this.notifyWithUndo('Bandeirada registrada', this.session.finishFlag());
  }

  /**
   * Decisão (docs/decisions/0001): passagem abaixo da volta mínima NÃO é bloqueada nem descartada
   * (nunca perder lançamento). A tela só avisa, com Desfazer, e marca o cartão. Quem invalida a
   * volta oficialmente é o motor de regras.
   */
  private checkRepeatedTap(registrationId: string, event: TimingEvent): void {
    clearTimeout(this.suspectTimer);
    const lapMs = this.session.pilots().find((p) => p.entry.registrationId === registrationId)?.lastLapMs;
    const minLapMs = this.session.heat().minLapMs;
    if (lapMs === null || lapMs === undefined || lapMs >= minLapMs) {
      this.suspectRegistrationId.set(null);
      return;
    }
    const n = this.session.raceNumberOf(registrationId);
    this.suspectRegistrationId.set(registrationId);
    this.suspectTimer = setTimeout(() => this.suspectRegistrationId.set(null), SUSPECT_HIGHLIGHT_MS);
    this.toasts.show(`Volta de ${msToDisplay(lapMs, 1)} no #${n}, abaixo da mínima (${msToDisplay(minLapMs)}). Toque repetido?`, {
      tone: 'warn',
      durationMs: SUSPECT_HIGHLIGHT_MS,
      action: {
        label: 'Desfazer',
        run: () => {
          this.session.undo(event.id);
          this.suspectRegistrationId.set(null);
        },
      },
    });
  }

  private notifyWithUndo(message: string, event: TimingEvent): void {
    this.toasts.show(message, {
      action: { label: 'Desfazer', run: () => this.session.undo(event.id) },
    });
  }

  private describe(e: TimingEvent): string {
    const n = this.session.raceNumberOf(e.registrationId);
    switch (e.type) {
      case 'LAP_PASS':
        return `passagem do #${n}`;
      case 'PENALTY':
        return `penalidade do #${n}`;
      case 'DSQ':
        return `desclassificação do #${n}`;
      case 'FINISH_FLAG':
        return 'bandeirada';
      default:
        return 'última ação';
    }
  }

  /**
   * Sair (trocar de usuário no aparelho). Com lançamentos ainda não enviados, pede confirmação:
   * até a fase 5 a fila fica só na memória e se perderia ao sair.
   */
  protected requestLogout(): void {
    if (this.outbox.pendingCount() > 0) this.logoutDialog().open();
    else void this.auth.logout();
  }

  protected logout(): void {
    void this.auth.logout();
  }
}
