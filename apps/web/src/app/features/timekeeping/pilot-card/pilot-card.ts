import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatPenalty, msToDisplay } from '../../../shared/format/race-time';
import { PilotSummary } from '../timing-log';

/** O que um toque no cartão faz agora. */
export type TapMode = 'lap' | 'penalty' | 'dsq';

const TAP_HINT: Record<TapMode, string> = { lap: 'TOQUE', penalty: 'PENALIZAR', dsq: 'DESCLASSIFICAR' };

/**
 * Cartão de um piloto na tela de pista (PDF, página 6). O cartão INTEIRO é o botão: um toque =
 * uma passagem (ou penalidade/desclassificação, se essa ação estiver armada).
 * Alvo grande (≥ 120px), `touch-action: manipulation` (sem atraso de duplo toque/zoom).
 */
@Component({
  selector: 'app-pilot-card',
  template: `
    <button
      type="button"
      [class]="buttonClass()"
      [attr.aria-label]="ariaLabel()"
      (click)="tapped.emit(pilot().entry.registrationId)"
    >
      <span class="flex items-start justify-between gap-2">
        <span class="text-5xl leading-none font-bold">{{ pilot().entry.raceNumber }}</span>
        <span class="text-[0.7rem] font-bold" [class]="hintClass()">{{ hint() }}</span>
      </span>
      <span class="mt-2 block truncate text-sm" [class.opacity-80]="!highlighted()">{{ shortName() }}</span>
      <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-base font-bold">
        <span>V{{ pilot().laps }}@if (lastLap()) { • {{ lastLap() }}}</span>
        @if (pilot().penaltyMs) {
          <span class="rounded-full bg-danger px-2 text-xs text-on-state">{{ penalty() }}</span>
        }
      </span>
    </button>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PilotCard {
  readonly pilot = input.required<PilotSummary>();
  /** Última passagem registrada: cartão em laranja. */
  readonly highlighted = input(false);
  readonly mode = input<TapMode>('lap');
  /** Última passagem abaixo da volta mínima: possível toque repetido (aviso, não bloqueio). */
  readonly suspect = input(false);
  // output(): evento para o pai. Uso: (tapped)="onTap($event)". Leva o id da inscrição.
  readonly tapped = output<string>();

  protected readonly shortName = computed(() => {
    const parts = this.pilot().entry.pilotName.split(' ');
    return parts.length > 1 ? `${parts[0][0]}. ${parts.at(-1)}` : parts[0];
  });
  protected readonly lastLap = computed(() => {
    const ms = this.pilot().lastLapMs;
    return ms === null ? '' : msToDisplay(ms, 1);
  });
  protected readonly penalty = computed(() => formatPenalty(this.pilot().penaltyMs));
  protected readonly hint = computed(() =>
    this.pilot().disqualified ? 'DSQ' : this.suspect() ? 'REPETIDO?' : TAP_HINT[this.mode()],
  );

  protected readonly buttonClass = computed(() => {
    const base =
      'block w-full min-h-32 cursor-pointer touch-manipulation rounded-lg border-2 p-3 text-left select-none ' +
      'transition-transform active:scale-[0.97] ';
    // Toque suspeito: contorno âmbar grosso por cima de qualquer outro estado.
    const suspect = this.suspect() ? 'outline-solid outline-4 outline-offset-2 outline-warn ' : '';
    if (this.highlighted()) return base + suspect + 'border-brand-strong bg-brand-strong text-on-brand';
    const armed =
      this.mode() === 'penalty' ? 'outline-dashed outline-3 outline-offset-2 outline-warn '
      : this.mode() === 'dsq' ? 'outline-dashed outline-3 outline-offset-2 outline-danger '
      : '';
    const border = this.pilot().disqualified ? 'border-danger' : 'border-line-strong';
    return `${base}${suspect || armed}${border} bg-surface text-ink`;
  });
  protected readonly hintClass = computed(() =>
    this.pilot().disqualified ? 'rounded-full bg-danger px-2 text-on-state'
    : this.suspect() ? 'rounded-full bg-warn px-2 text-on-warn'
    : this.highlighted() ? 'text-on-brand'
    : 'text-ink-2',
  );

  protected readonly ariaLabel = computed(() => {
    const p = this.pilot();
    const action =
      this.mode() === 'penalty' ? 'Toque para aplicar penalidade'
      : this.mode() === 'dsq' ? 'Toque para desclassificar'
      : 'Toque para registrar passagem';
    const status = p.disqualified ? ', desclassificado' : this.suspect() ? ', possível toque repetido' : '';
    const last = this.lastLap() ? `, última volta ${this.lastLap()}` : '';
    return `Número ${p.entry.raceNumber}, ${p.entry.pilotName}, ${p.laps} voltas${last}${status}. ${action}.`;
  });
}
