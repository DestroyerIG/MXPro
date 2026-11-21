import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from '../src/payments/token-cipher.ts';

const key = Buffer.alloc(32, 1);

describe('criptografia dos tokens', () => {
  it('ida e volta', () => {
    const token = 'APP_USR-4934588586838432-XXXXXXXX-241983636';
    const stored = encryptToken(token, key);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain(token);
    expect(decryptToken(stored, key)).toBe(token);
  });

  it('o mesmo token gera textos diferentes (IV aleatório)', () => {
    expect(encryptToken('abc', key)).not.toBe(encryptToken('abc', key));
  });

  it('chave errada ou texto adulterado: falha em vez de devolver lixo', () => {
    const stored = encryptToken('segredo', key);
    expect(() => decryptToken(stored, Buffer.alloc(32, 2))).toThrow();
    const [v, iv, tag, data] = stored.split('.');
    const flipped = `${data![0] === 'A' ? 'B' : 'A'}${data!.slice(1)}`;
    expect(() => decryptToken([v, iv, tag, flipped].join('.'), key)).toThrow();
    expect(() => decryptToken('lixo', key)).toThrow(/formato desconhecido/);
  });
});
