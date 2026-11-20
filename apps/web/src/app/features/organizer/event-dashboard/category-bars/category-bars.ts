import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface CategoryBarItem {
  id: string;
  label: string;
  count: number;
}

/**
 * Barras horizontais de inscritos por categoria (PDF, página 3). Feito com HTML/CSS, sem
 * biblioteca de gráficos: são 6 barras, e uma lib traria dezenas de KB ao painel.
 *
 * Acessibilidade: cada linha é um item de lista lido como "MX1: 24 inscritos" (o ":" e o
 * "inscritos" existem só para leitor de tela, senão ele poderia ler "MX124");
 * a barra em si é decorativa (aria-hidden).
 */
@Component({
  selector: 'app-category-bars',
  template: `
    <ul class="grid gap-3">
      @for (bar of bars(); track bar.id) {
        <li class="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 text-sm">
          <span class="truncate text-ink-2">{{ bar.label }}<span class="sr-only">:</span></span>
          <span class="flex items-center gap-2">
            <span class="h-4 rounded-md bg-brand" [style.width.%]="bar.widthPct" aria-hidden="true"></span>
            <strong class="text-ink">{{ bar.count }}<span class="sr-only"> inscritos</span></strong>
          </span>
        </li>
      }
    </ul>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryBars {
  readonly items = input.required<readonly CategoryBarItem[]>();

  /** Largura relativa à maior categoria. Reserva espaço para o número ao lado da barra. */
  protected readonly bars = computed(() => {
    const max = Math.max(1, ...this.items().map((i) => i.count));
    return this.items().map((i) => ({ ...i, widthPct: (i.count / max) * 85 }));
  });
}
