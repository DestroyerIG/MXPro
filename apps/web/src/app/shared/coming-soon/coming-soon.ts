import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Página provisória para áreas do menu que ainda não têm tela.
 * Os textos vêm do `data` da rota e chegam aqui como input() graças ao
 * `withComponentInputBinding()` (app.config.ts):
 *   { path: 'eventos', component: ComingSoon, data: { heading: 'Eventos', description: '...' } }
 */
@Component({
  selector: 'app-coming-soon',
  template: `
    <h1 class="text-2xl font-bold">{{ heading() }}</h1>
    <div class="mt-6 rounded-lg border border-dashed border-line-strong bg-surface p-6">
      <p class="font-bold">Esta área ainda não foi construída.</p>
      @if (description()) {
        <p class="mt-1 text-ink-2">{{ description() }}</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComingSoon {
  readonly heading = input.required<string>();
  readonly description = input<string>();
}
