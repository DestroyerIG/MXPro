import { ChangeDetectionStrategy, Component, type ElementRef, input, output, viewChild } from '@angular/core';
import { Button } from '../button/button';

let nextId = 0;

/**
 * Confirmação de ação séria (cancelar evento, excluir). Na pista NÃO usamos isto (lá é "Desfazer");
 * no escritório, para o que não tem volta, uma confirmação clara evita o clique por engano.
 *
 * Usa o <dialog> nativo com `showModal()`: o navegador já prende o foco dentro dele, fecha com Esc,
 * deixa o fundo inerte e devolve o foco a quem abriu. Alternativa: o CDK Dialog do Angular, útil
 * para casos complexos; aqui o nativo resolve sem dependência.
 *
 * Uso:
 *   <ui-confirm-dialog #dlg heading="Cancelar evento?" confirmLabel="Cancelar evento" (confirmed)="cancel()">
 *     Texto explicando a consequência.
 *   </ui-confirm-dialog>
 *   <button (click)="dlg.open()">…</button>
 */
@Component({
  selector: 'ui-confirm-dialog',
  imports: [Button],
  template: `
    <dialog
      #dialog
      [attr.aria-labelledby]="headingId"
      class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-black/50"
      (close)="closed.emit()"
    >
      <form method="dialog" class="grid gap-4 p-5" (submit)="onSubmit($event)">
        <h2 [id]="headingId" class="text-lg font-bold">{{ heading() }}</h2>
        <div class="text-sm text-ink-2"><ng-content /></div>
        <div class="flex flex-wrap justify-end gap-2">
          <!-- Primeiro botão focado ao abrir: o caminho seguro ("Voltar") é o padrão. -->
          <button uiButton type="button" variant="secondary" autofocus (click)="close()">{{ dismissLabel() }}</button>
          <button uiButton type="submit" [variant]="tone() === 'danger' ? 'danger' : 'primary'">{{ confirmLabel() }}</button>
        </div>
      </form>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly heading = input.required<string>();
  /** Verbo da ação, igual ao do botão que abriu (ex.: "Cancelar evento"). */
  readonly confirmLabel = input.required<string>();
  readonly dismissLabel = input('Voltar');
  readonly tone = input<'danger' | 'primary'>('danger');

  /** Disparado ao confirmar (o diálogo já fechou). */
  readonly confirmed = output<void>();
  /** Disparado sempre que fecha (confirmando, voltando ou com Esc). */
  readonly closed = output<void>();

  protected readonly headingId = `ui-confirm-${nextId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.close();
    this.confirmed.emit();
  }
}
