import { contrastRatio, deriveBrandPalette, isHexColor } from './color';

describe('contrastRatio', () => {
  it('dá 21:1 entre preto e branco', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('é simétrico', () => {
    expect(contrastRatio('#E8590C', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#E8590C'), 5);
  });

  it('confere o valor medido do laranja do PDF (3,58:1 com branco)', () => {
    expect(contrastRatio('#E8590C', '#FFFFFF')).toBeCloseTo(3.58, 1);
  });
});

describe('isHexColor', () => {
  it.each(['#E8590C', '#e8590c'])('aceita %s', (c) => expect(isHexColor(c)).toBe(true));
  it.each(['E8590C', '#E85', 'red', '#GG0000', ''])('recusa %s', (c) => expect(isHexColor(c)).toBe(false));
});

describe('deriveBrandPalette', () => {
  it('mantém a cor original como primária', () => {
    expect(deriveBrandPalette('#E8590C').primary).toBe('#e8590c');
  });

  it('escurece o tom "forte" até o texto branco passar no AA (≥ 4,5:1)', () => {
    const p = deriveBrandPalette('#E8590C');
    expect(p.onPrimary).toBe('#ffffff');
    expect(contrastRatio(p.strong, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('usa texto escuro quando a marca é clara demais (ex.: amarelo)', () => {
    const p = deriveBrandPalette('#FFD43B');
    expect(p.onPrimary).toBe('#1b1e23');
    expect(contrastRatio(p.strong, p.onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it('gera tons de texto que passam no AA nos dois temas', () => {
    for (const brand of ['#E8590C', '#FFD43B', '#1C7ED6']) {
      const p = deriveBrandPalette(brand);
      expect(contrastRatio(p.textOnLight, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.textOnDark, '#1a1d23')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('recusa cor inválida', () => {
    expect(() => deriveBrandPalette('laranja')).toThrow();
  });
});
