import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChildren } from '@angular/core';

export interface TabItem {
  id: string;
  label: string;
}

let nextId = 0;

const TAB = 'h-9 rounded-full border px-4 text-sm font-bold cursor-pointer transition-colors';
const ACTIVE = 'bg-brand-strong border-brand-strong text-on-brand';
const IDLE = 'bg-surface border-line-strong text-ink hover:bg-zebra';

/**
 * Abas em pílula (ex.: categorias na página pública). Segue o padrão ARIA "tabs":
 * setas ←/→, Home e End mudam de aba; só a aba ativa entra no Tab do teclado (roving tabindex).
 *
 * `model()`: input que também pode ser ESCRITO pelo componente; o pai usa "banana na caixa":
 *   <ui-tabs label="Categorias" [tabs]="categorias" [(selected)]="categoriaAtual" />
 * Alternativa: o pacote @angular/aria tem abas prontas e acessíveis. Para um caso simples
 * como este, um componente próprio pequeno evita mais uma dependência.
 */
@Component({
  selector: 'ui-tabs',
  template: `
    <div role="tablist" [attr.aria-label]="label()" class="flex flex-wrap gap-2" (keydown)="onKeydown($event)">
      @for (tab of tabs(); track tab.id) {
        <button
          #tabButton
          type="button"
          role="tab"
          [id]="tabId(tab.id)"
          [class]="tab.id === selected() ? activeClass : idleClass"
          [attr.aria-selected]="tab.id === selected()"
          [tabIndex]="tab.id === selected() ? 0 : -1"
          (click)="selected.set(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tabs {
  readonly tabs = input.required<readonly TabItem[]>();
  /** Nome do grupo para leitores de tela, ex.: "Categorias". */
  readonly label = input.required<string>();
  readonly selected = model.required<string>();

  // viewChildren(): consulta reativa aos elementos marcados com #tabButton no template.
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private readonly baseId = `ui-tabs-${nextId++}`;
  protected readonly activeClass = `${TAB} ${ACTIVE}`;
  protected readonly idleClass = `${TAB} ${IDLE}`;

  /** Id do botão da aba, para o painel de conteúdo usar em `aria-labelledby`. */
  tabId(id: string): string {
    return `${this.baseId}-${id}`;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const list = this.tabs();
    const current = list.findIndex((t) => t.id === this.selected());
    const last = list.length - 1;
    const next =
      event.key === 'ArrowRight' ? (current >= last ? 0 : current + 1)
      : event.key === 'ArrowLeft' ? (current <= 0 ? last : current - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : -1;
    if (next < 0) return;
    event.preventDefault();
    this.selected.set(list[next].id);
    this.buttons()[next]?.nativeElement.focus();
  }
}
