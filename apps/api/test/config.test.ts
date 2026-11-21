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

  describe('Mercado Pago', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const mp = {
      MP_CLIENT_ID: '123',
      MP_CLIENT_SECRET: 'segredo',
      MP_REDIRECT_URI: 'https://mxpro.test/api/payments/mercadopago/callback',
      MP_WEBHOOK_SECRET: 'segredo-do-webhook',
      PAYMENT_TOKEN_KEY: key,
    };

    it('sem as variáveis: integração desligada (null)', () => {
      expect(loadConfig(base).mercadoPago).toBeNull();
    });

    it('com todas: credenciais, modo de teste e chave de 32 bytes', () => {
      const c = loadConfig({ ...base, ...mp, MP_TEST_MODE: 'true' }).mercadoPago;
      expect(c).toMatchObject({ clientId: '123', clientSecret: 'segredo', testMode: true });
      expect(c?.tokenKey).toHaveLength(32);
    });

    it('configuração pela metade é erro (diz qual variável falta)', () => {
      expect(() => loadConfig({ ...base, MP_CLIENT_ID: '123' })).toThrow(/MP_CLIENT_SECRET/);
      expect(() => loadConfig({ ...base, ...mp, PAYMENT_TOKEN_KEY: undefined })).toThrow(/PAYMENT_TOKEN_KEY/);
    });

    it('chave de criptografia precisa ter 32 bytes', () => {
      expect(() => loadConfig({ ...base, ...mp, PAYMENT_TOKEN_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/32 bytes/);
    });
  });
});
