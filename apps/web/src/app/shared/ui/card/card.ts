import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Cartão branco com borda fina (o PDF usa borda, não sombra).
 * `<ng-content />` é a "projeção de conteúdo": o que o consumidor escreve entre as tags aparece ali.
 *
 * Uso: <ui-card heading="Próximas baterias"> ...conteúdo... </ui-card>
 */
@Component({
  selector: 'ui-card',
  template: `
    @if (heading()) {
      <h2 class="mb-3 text-base font-bold">{{ heading() }}</h2>
    }
    <ng-content />
  `,
  host: { class: 'block min-w-0 rounded-lg border border-line bg-surface p-4' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Card {
  readonly heading = input<string>();
}
