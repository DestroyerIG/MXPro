import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type StatTileTone = 'brand' | 'ok' | 'warn' | 'info';

const BORDER: Record<StatTileTone, string> = {
  brand: 'border-l-brand',
  ok: 'border-l-ok',
  warn: 'border-l-warn',
  info: 'border-l-info',
};

/**
 * Card de total do painel, com a borda colorida à esquerda do PDF.
 * Uso: <ui-stat-tile label="Inscritos" [value]="128" tone="brand" />
 */
@Component({
  selector: 'ui-stat-tile',
  template: `
    <span class="block text-sm text-ink-2">{{ label() }}</span>
    <strong class="block text-3xl leading-tight font-bold">{{ value() }}</strong>
  `,
  host: { '[class]': 'classes()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatTile {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly tone = input<StatTileTone>('brand');
  protected readonly classes = computed(
    () => `block rounded-lg border border-l-4 border-line bg-surface px-4 py-3 ${BORDER[this.tone()]}`,
  );
}
