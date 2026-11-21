import { ChangeDetectionStrategy, Component, Directive, booleanAttribute, computed, inject, input } from '@angular/core';

let nextId = 0;

/**
 * Campo de formulário: rótulo sempre visível + controle + dica ou erro.
 * Liga tudo para leitores de tela (label `for`, `aria-describedby`, `aria-invalid`).
 *
 * Uso:
 *   <ui-form-field label="Nome completo" hint="Como no documento" [error]="erroNome">
 *     <input uiControl type="text" />
 *   </ui-form-field>
 */
@Component({
  selector: 'ui-form-field',
  template: `
    <label [for]="controlId" class="mb-1 block text-xs font-bold text-ink-2">
      {{ label() }}
      @if (required()) {
        <span class="text-danger-text" aria-hidden="true">*</span>
      }
    </label>
    <ng-content />
    @if (error()) {
      <p [id]="errorId" class="mt-1 text-xs font-bold text-danger-text">{{ error() }}</p>
    } @else if (hint()) {
      <p [id]="hintId" class="mt-1 text-xs text-ink-2">{{ hint() }}</p>
    }
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormField {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null>();
  // `transform: booleanAttribute` permite escrever só <ui-form-field required> no template.
  readonly required = input(false, { transform: booleanAttribute });

  readonly controlId = `ui-field-${nextId++}`;
  protected readonly hintId = `${this.controlId}-hint`;
  protected readonly errorId = `${this.controlId}-error`;
  readonly describedBy = computed(() => (this.error() ? this.errorId : this.hint() ? this.hintId : null));
}

/**
 * Diretiva para o <input>/<select>/<textarea> dentro de um <ui-form-field>.
 *
 * `inject(FormField)`: uma diretiva pode pedir o componente PAI por injeção de dependência.
 * O Angular sobe pela árvore de elementos até achar o <ui-form-field> e entrega a mesma instância.
 * É assim que o controle descobre o id, a dica e o erro sem o consumidor repetir nada.
 */
@Directive({
  selector: 'input[uiControl], select[uiControl], textarea[uiControl]',
  host: {
    class:
      'w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-muted ' +
      'h-10 [&:is(textarea)]:h-auto [&:is(textarea)]:py-2 disabled:cursor-not-allowed disabled:bg-zebra disabled:text-ink-2',
    '[class.border-control]': '!field.error()',
    '[class.border-danger]': '!!field.error()',
    '[id]': 'field.controlId',
    '[attr.aria-describedby]': 'field.describedBy()',
    '[attr.aria-invalid]': 'field.error() ? true : null',
    '[attr.aria-required]': 'field.required() || null',
  },
})
export class Control {
  protected readonly field = inject(FormField);
}
