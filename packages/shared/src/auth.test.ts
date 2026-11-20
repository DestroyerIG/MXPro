import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ROLES, ROLE_LABELS, loginRequestSchema } from './auth.ts';

describe('loginRequestSchema', () => {
  it('normaliza o e-mail (espaços e maiúsculas), igual ao que o banco guarda', () => {
    expect(loginRequestSchema.parse({ email: '  Org@MXPRO.test ', password: 'x' }).email).toBe('org@mxpro.test');
  });

  it('mensagens em português por campo', () => {
    const r = loginRequestSchema.safeParse({ email: 'nao-e-email', password: '' });
    expect(r.success).toBe(false);
    expect(z.flattenError(r.error!).fieldErrors).toEqual({
      email: ['Informe um e-mail válido.'],
      password: ['Informe a senha.'],
    });
  });

  it('campos ausentes também têm mensagem clara', () => {
    const r = loginRequestSchema.safeParse({});
    expect(z.flattenError(r.error!).fieldErrors).toEqual({ email: ['Informe o e-mail.'], password: ['Informe a senha.'] });
  });

  it('recusa senha gigante (evita gastar CPU com hash de textos enormes)', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.test', password: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('ROLES', () => {
  it('todo perfil tem rótulo em português', () => {
    expect(ROLES.map((r) => ROLE_LABELS[r])).toEqual(['Organizador', 'Secretaria', 'Cronometrista', 'Piloto']);
  });
});
