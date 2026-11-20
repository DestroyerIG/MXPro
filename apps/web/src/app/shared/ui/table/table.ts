import { Directive } from '@angular/core';

/**
 * Aplica o estilo de tabela do PDF (cabeçalho grafite, linhas zebradas) a uma <table> comum.
 * É uma DIRETIVA, não componente: não tem template próprio, só acrescenta comportamento/classe
 * a um elemento existente. O CSS fica em styles.css (`.ui-table`) porque as <th>/<td> pertencem
 * ao template de quem usa a tabela, fora do alcance do CSS encapsulado de um componente.
 *
 * Uso: <table uiTable> ... </table>   (células numéricas: class="num")
 */
@Directive({
  selector: 'table[uiTable]',
  host: { class: 'ui-table' },
})
export class Table {}
