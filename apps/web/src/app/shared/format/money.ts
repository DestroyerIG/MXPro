/**
 * Dinheiro na tela (docs/arquitetura.md §2.6): a API trabalha em CENTAVOS inteiros; aqui só
 * convertemos para/de texto em reais. Nada de float: "0,1 + 0,2" em centavos é 10 + 20 = 30.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** Espaço não separável que o Intl coloca entre "R$" e o número. */
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');

/** 15000 → "R$ 150,00" */
export function formatBrl(cents: number): string {
  return BRL.format(cents / 100).replace(NBSP, ' ');
}

/** 15000 → "150,00" (para preencher um campo de valor). */
export function centsToInput(cents: number): string {
  const reais = Math.trunc(cents / 100);
  const rest = String(Math.abs(cents % 100)).padStart(2, '0');
  return `${reais},${rest}`;
}

/**
 * Texto digitado em reais → centavos. Aceita "150", "150,5", "150,50", "1.500,00" e "R$ 150,00".
 * Devolve null se não for um valor válido (letras, mais de 2 casas, negativo…).
 * Trabalha com o TEXTO dos dígitos, sem passar por número decimal.
 */
export function parseBrl(text: string): number | null {
  const clean = text.replace(/R\$/i, '').replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(clean)) return null;
  const [int, frac = ''] = clean.replace(/\./g, '').split(',');
  return Number(int) * 100 + Number(frac.padEnd(2, '0'));
}
