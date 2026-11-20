import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Tons de estado (direcao-visual §2.3):
 * ok = Pronta/Pago/Aprovada/Em prova · warn = Pendente/Grid pendente/Offline · idle = Aguardando
 * danger = Desclassificado/erro · info = informativo · brand = destaque da marca.
 */
export type StatusTone = 'ok' | 'warn' | 'idle' | 'danger' | 'info' | 'brand';

const TONES: Record<StatusTone, string> = {
  ok: 'bg-ok-strong text-on-state',
  warn: 'bg-warn text-on-warn',
  idle: 'bg-idle text-on-state',
  danger: 'bg-danger text-on-state',
  info: 'bg-info-strong text-on-state',
  brand: 'bg-brand-strong text-on-brand',
};

/**
 * Pílula de estado. O texto vem do conteúdo, então a cor nunca é o único sinal.
 * Uso: <ui-status-badge tone="warn">Grid pendente</ui-status-badge>
 */
@Component({
  selector: 'ui-status-badge',
  template: '<ng-content />',
  host: { '[class]': 'classes()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  readonly tone = input<StatusTone>('idle');
  /** `lg`: cabeçalho da pista, lido a distância. */
  readonly size = input<'sm' | 'lg'>('sm');
  protected readonly classes = computed(
    () =>
      'inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap ' +
      (this.size() === 'lg' ? 'px-4 py-1.5 text-sm ' : 'px-3 py-0.5 text-xs ') +
      TONES[this.tone()],
  );
}
