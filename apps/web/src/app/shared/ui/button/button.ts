import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dark';
/** `track` = botão de pista: no mínimo 64px de altura, para uso com luva (docs/arquitetura.md §4.3). */
export type ButtonSize = 'sm' | 'md' | 'lg' | 'track';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-bold cursor-pointer transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

// Classes escritas por extenso (não montadas com `bg-${x}`) para o Tailwind encontrá-las no código.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-strong text-on-brand hover:brightness-95',
  secondary: 'bg-surface text-ink border border-control hover:bg-zebra',
  danger: 'bg-surface text-danger-text border-2 border-danger hover:bg-zebra',
  dark: 'bg-chrome text-on-chrome border border-chrome-edge hover:bg-chrome-hover',
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  track: 'min-h-16 px-4 text-lg rounded-lg',
};

/**
 * Botão do sistema. O seletor é de ATRIBUTO (`<button uiButton>`), não um elemento novo
 * (`<ui-button>`): assim o elemento continua sendo um <button> de verdade, com teclado, foco,
 * `type`, `disabled` e acessibilidade nativos. Alternativa comum: um componente que embrulha um
 * <button> interno, mas aí é preciso repassar todos esses atributos à mão.
 *
 * Uso: <button uiButton variant="secondary" size="lg">Salvar</button>
 */
@Component({
  // Componente de ATRIBUTO de propósito (ver acima): a regra de seletor espera elemento "ui-*".
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'button[uiButton], a[uiButton]',
  template: '<ng-content />',
  // `host` aplica bindings no próprio elemento <button>. As classes que o consumidor escrever são mantidas.
  host: { '[class]': 'classes()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Button {
  // input(): input baseado em signal. Lido como função: this.variant().
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');

  // computed(): valor derivado que só é recalculado quando variant ou size mudam.
  protected readonly classes = computed(() => `${BASE} ${VARIANTS[this.variant()]} ${SIZES[this.size()]}`);
}
