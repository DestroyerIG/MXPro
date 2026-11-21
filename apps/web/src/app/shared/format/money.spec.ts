import { centsToInput, formatBrl, parseBrl } from './money';

describe('dinheiro (centavos ↔ reais)', () => {
  it('formata centavos em reais', () => {
    expect(formatBrl(15000)).toBe('R$ 150,00');
    expect(formatBrl(8050)).toBe('R$ 80,50');
    expect(formatBrl(0)).toBe('R$ 0,00');
    expect(formatBrl(150000)).toBe('R$ 1.500,00');
  });

  it('preenche o campo de valor', () => {
    expect(centsToInput(15000)).toBe('150,00');
    expect(centsToInput(8005)).toBe('80,05');
    expect(centsToInput(0)).toBe('0,00');
  });

  it.each([
    ['150', 15000],
    ['150,5', 15050],
    ['150,50', 15050],
    ['0,10', 10],
    ['1.500,00', 150000],
    ['1500,00', 150000],
    ['R$ 150,00', 15000],
    [' 80 ', 8000],
  ])('"%s" → %d centavos', (text, cents) => {
    expect(parseBrl(text)).toBe(cents);
  });

  it('sem erro de arredondamento (0,29 não vira 28,999…)', () => {
    expect(parseBrl('0,29')).toBe(29);
    expect(parseBrl('1,15')).toBe(115);
  });

  it.each(['', 'abc', '150,555', '-10', '1,500.00', '15.00', '1.50,00', '10,'])('"%s" é inválido', (text) => {
    expect(parseBrl(text)).toBeNull();
  });
});
