import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5433/db' };

describe('loadConfig', () => {
  it('aplica padrões seguros para desenvolvimento', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 3000,
      corsOrigins: ['http://localhost:4200'],
      logLevel: 'info',
    });
  });

  it('lê porta como número e várias origens de CORS separadas por vírgula', () => {
    const c = loadConfig({ ...base, PORT: '8080', CORS_ORIGINS: 'https://a.com.br, https://telao.a.com.br' });
    expect(c.port).toBe(8080);
    expect(c.corsOrigins).toEqual(['https://a.com.br', 'https://telao.a.com.br']);
  });

  it('recusa configuração inválida com mensagem que diz o que corrigir', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...base, CORS_ORIGINS: 'não-é-url' })).toThrow(/CORS_ORIGINS/);
  });

  it('em produção exige CORS explícito (não aceita o padrão de desenvolvimento)', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
  });
});
