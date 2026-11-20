/**
 * Utilitários de cor puros (sem Angular). Usados para derivar os tons da marca do contratante
 * garantindo contraste WCAG AA, em vez de confiar que a cor escolhida "dá certo".
 */

const HEX = /^#[0-9a-f]{6}$/i;
const INK = '#1b1e23';
const WHITE = '#ffffff';
const AA_TEXT = 4.5;
/** Contraste mínimo da cor original com branco para valer a pena escurecê-la e manter texto branco. */
const MIN_WHITE_START = 2.5;

export interface BrandPalette {
  /** Cor original: barras, faixas, bordas, números grandes. */
  primary: string;
  /** Tom para preenchimentos com texto pequeno (botão, menu ativo). */
  strong: string;
  /** Cor do texto sobre `strong`. */
  onPrimary: string;
  /** Texto na cor da marca sobre superfície clara (tema claro). */
  textOnLight: string;
  /** Texto na cor da marca sobre superfície escura (tema escuro). */
  textOnDark: string;
}

/** Superfície de cartão do tema escuro (tokens.css). */
const DARK_SURFACE = '#1a1d23';

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

function toRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: readonly number[]): string {
  return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Luminância relativa (WCAG 2.x). */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Escurece em passos de 1% até atingir o contraste pedido contra `against`. */
function darkenUntil(hex: string, against: string, target: number): string {
  const rgb = toRgb(hex);
  for (let k = 1; k > 0; k -= 0.01) {
    const candidate = toHex(rgb.map((v) => v * k));
    if (contrastRatio(candidate, against) >= target) return candidate;
  }
  return '#000000';
}

/** Clareia (mistura com branco) em passos de 2% até atingir o contraste pedido. */
function lightenUntil(hex: string, against: string, target: number): string {
  const rgb = toRgb(hex);
  for (let k = 0; k <= 1; k += 0.02) {
    const candidate = toHex(rgb.map((v) => v + (255 - v) * k));
    if (contrastRatio(candidate, against) >= target) return candidate;
  }
  return WHITE;
}

export function deriveBrandPalette(input: string): BrandPalette {
  if (!isHexColor(input)) throw new Error(`Cor de marca inválida: "${input}". Use o formato #RRGGBB.`);
  const primary = input.toLowerCase();

  // Texto branco se der para chegar no AA escurecendo POUCO a cor (preserva a identidade: o laranja do
  // PDF tem 3,6:1 com branco e vira #C84D0A). Cores claras (amarelo, ~1,4:1) levam texto escuro.
  // Não basta comparar "branco vs escuro" na cor original: no laranja o escuro ganharia (4,7 x 3,6)
  // e o botão sairia com texto preto, diferente do PDF.
  const whiteStrong = darkenUntil(primary, WHITE, AA_TEXT);
  const useWhite = contrastRatio(primary, WHITE) >= MIN_WHITE_START;
  const onPrimary = useWhite ? WHITE : INK;
  const strong = useWhite ? whiteStrong : primary;

  const textOnLight = darkenUntil(primary, WHITE, AA_TEXT);
  const textOnDark = lightenUntil(primary, DARK_SURFACE, AA_TEXT);
  return { primary, strong, onPrimary, textOnLight, textOnDark };
}
