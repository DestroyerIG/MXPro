import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService, ToastTone } from './toast.service';

const TONE_BORDER: Record<ToastTone, string> = {
  info: 'border-l-brand',
  ok: 'border-l-ok',
  warn: 'border-l-warn',
  danger: 'border-l-danger',
};

/**
 * Onde os toasts aparecem. Fica uma única vez no componente raiz (App).
 * A região `aria-live` existe sempre na página, para leitores de tela anunciarem cada toast novo.
 * Telas com barra fixa no rodapé (pista) definem `--toast-offset` para os avisos não a cobrirem.
 */
@Component({
  selector: 'ui-toast-outlet',
  template: `
    <div
      role="status"
      aria-live="polite"
      class="pointer-events-none fixed inset-x-0 bottom-[var(--toast-offset,0px)] z-50 flex flex-col items-center gap-2 p-4"
    >
      @for (toast of toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex max-w-full items-center gap-3 rounded-lg border-l-4 bg-chrome py-2 pr-2 pl-4 text-on-chrome shadow-float"
          [class]="toneBorder[toast.tone]"
        >
          <span class="text-sm">{{ toast.message }}</span>
          @if (toast.action; as action) {
            <button
              type="button"
              class="h-10 cursor-pointer rounded-md bg-brand-strong px-4 text-sm font-bold text-on-brand"
              (click)="service.runAction(toast.id)"
            >
              {{ action.label }}
            </button>
          }
          <button
            type="button"
            class="grid size-10 cursor-pointer place-items-center rounded-md text-on-chrome-muted hover:bg-chrome-hover"
            aria-label="Fechar aviso"
            (click)="service.dismiss(toast.id)"
          >
            ✕
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastOutlet {
  protected readonly service = inject(ToastService);
  protected readonly toasts = this.service.toasts;
  protected readonly toneBorder = TONE_BORDER;
}
