import { createHash } from 'node:crypto';
import type { PrismaClient } from '@mxpro/db';
import { type Mock, afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { REFRESH_BEFORE_MS, finishConnection, getAccessToken, startConnection } from '../src/payments/mercadopago/connection.service.ts';
import type { MercadoPagoOAuth, MercadoPagoTokens } from '../src/payments/mercadopago/oauth-client.ts';
import { encryptToken } from '../src/payments/token-cipher.ts';
import { SESSION_COOKIE, actingAs, createUser, integrationApp, resetDb, testDb } from './db-helpers.ts';

/** Conexão da conta do Mercado Pago (OAuth com PKCE), com o Mercado Pago SIMULADO (sem rede). */

const KEY = Buffer.alloc(32, 9);
const MP_ENV = {
  MP_CLIENT_ID: '1234567890',
  MP_CLIENT_SECRET: 'segredo-do-app',
  MP_REDIRECT_URI: 'https://mxpro.test/api/payments/mercadopago/callback',
  PAYMENT_TOKEN_KEY: KEY.toString('base64'),
};
const MP_CONFIG = loadConfig({ DATABASE_URL: 'postgresql://x@localhost/x', ...MP_ENV }).mercadoPago!;

const tokens = (n: number): MercadoPagoTokens => ({
  access_token: `APP_USR-access-${n}`,
  refresh_token: `TG-refresh-${n}`,
  expires_in: 15_552_000,
  user_id: '241983636',
  public_key: 'APP_USR-public',
  scope: 'read write offline_access',
  live_mode: true,
});

let db: PrismaClient;
let app: Awaited<ReturnType<typeof integrationApp>>;
let as: Awaited<ReturnType<typeof actingAs>>;
let oauth: { exchangeCode: Mock<MercadoPagoOAuth['exchangeCode']>; refresh: Mock<MercadoPagoOAuth['refresh']> };

beforeAll(() => {
  db = testDb();
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await app?.close();
  await resetDb(db);
  oauth = {
    exchangeCode: vi.fn<MercadoPagoOAuth['exchangeCode']>().mockResolvedValue(tokens(1)),
    refresh: vi.fn<MercadoPagoOAuth['refresh']>().mockResolvedValue(tokens(2)),
  };
  app = await integrationApp(db, MP_ENV, { mercadoPagoOAuth: oauth });
  as = await actingAs(app, db, 'ORGANIZER');
});

/** Inicia a conexão e devolve os parâmetros da URL de autorização. */
async function connect(caller = as) {
  const res = await caller('POST', '/api/payments/mercadopago/connect', {});
  expect(res.statusCode).toBe(200);
  return new URL(res.json().authorizationUrl as string);
}
const callback = (params: Record<string, string>, caller = as) =>
  caller('GET', `/api/payments/mercadopago/callback?${new URLSearchParams(params).toString()}`);
const resultOf = (res: { statusCode: number; headers: Record<string, unknown> }) => {
  expect(res.statusCode).toBe(303);
  return new URL(String(res.headers['location']), 'https://mxpro.test').searchParams.get('mercadopago');
};

describe('sem as credenciais do aplicativo no servidor', () => {
  it('a tela vê "não configurado" e conectar dá 409 com mensagem clara', async () => {
    await app.close();
    app = await integrationApp(db);
    as = await actingAs(app, db, 'ORGANIZER');
    expect((await as('GET', '/api/payments/mercadopago')).json()).toEqual({ configured: false, account: null });
    const res = await as('POST', '/api/payments/mercadopago/connect', {});
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('MP_NOT_CONFIGURED');
    expect(resultOf(await callback({ code: 'x', state: 'y' }))).toBe('nao-configurado');
  });
});

describe('conectar (OAuth com PKCE)', () => {
  it('URL de autorização com app, retorno cadastrado, state e desafio PKCE S256; o state só fica no banco como hash', async () => {
    const url = await connect();
    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com/authorization');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: '1234567890',
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: MP_ENV.MP_REDIRECT_URI,
      code_challenge_method: 'S256',
    });
    const state = url.searchParams.get('state')!;
    expect(state.length).toBeGreaterThanOrEqual(43);
    const [row] = await db.oAuthState.findMany();
    expect(row!.id).toBe(createHash('sha256').update(state).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(state);
  });

  it('retorno com código: troca pelos tokens com o verificador PKCE certo e guarda tudo criptografado', async () => {
    const url = await connect();
    const res = await callback({ code: 'TG-codigo', state: url.searchParams.get('state')! });
    expect(resultOf(res)).toBe('conectado');
    expect(res.headers['location']).toBe('/painel/financeiro?mercadopago=conectado');

    const [code, verifier] = oauth.exchangeCode.mock.calls[0]!;
    expect(code).toBe('TG-codigo');
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(url.searchParams.get('code_challenge'));

    const account = await db.mercadoPagoAccount.findUniqueOrThrow({ where: { id: 1 } });
    expect(account.accessTokenEncrypted).not.toContain('APP_USR-access-1');
    expect(account.refreshTokenEncrypted).not.toContain('TG-refresh-1');
    expect(await db.oAuthState.count()).toBe(0); // uso único

    const body = (await as('GET', '/api/payments/mercadopago')).json();
    expect(body).toMatchObject({ configured: true, account: { mpUserId: '241983636', liveMode: true, connectedBy: { name: 'Usuário de Teste' } } });
    // ~180 dias de validade.
    expect(new Date(body.account.expiresAt).getTime() - Date.now()).toBeGreaterThan(179 * 24 * 3_600_000);
    expect(JSON.stringify(body)).not.toMatch(/APP_USR-access|TG-refresh/); // tokens nunca saem da API
  });

  it('o mesmo state não serve duas vezes', async () => {
    const state = (await connect()).searchParams.get('state')!;
    expect(resultOf(await callback({ code: 'a', state }))).toBe('conectado');
    expect(resultOf(await callback({ code: 'b', state }))).toBe('expirado');
    expect(oauth.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it('state inventado, ausente ou de OUTRO organizador: recusado sem chamar o Mercado Pago', async () => {
    const state = (await connect()).searchParams.get('state')!;
    const other = await actingAs(app, db, 'ORGANIZER');
    expect(resultOf(await callback({ code: 'a', state }, other))).toBe('expirado');
    expect(resultOf(await callback({ code: 'a', state: 'inventado' }))).toBe('expirado');
    expect(resultOf(await callback({ code: 'a' }))).toBe('expirado');
    expect(oauth.exchangeCode).not.toHaveBeenCalled();
  });

  it('state vencido (mais de 10 minutos): recusado', async () => {
    const user = await createUser(db, { email: 'org@mxpro.test', role: 'ORGANIZER' });
    const started = new Date('2027-01-01T12:00:00Z');
    const state = new URL(await startConnection(db, MP_CONFIG, user.id, started)).searchParams.get('state')!;
    const late = new Date(started.getTime() + 11 * 60_000);
    expect(await finishConnection(db, MP_CONFIG, oauth, { code: 'a', state }, user.id, late)).toBe('expirado');
  });

  it('organizador cancelou no Mercado Pago, ou a troca falhou: resultado para a tela, nada salvo', async () => {
    let state = (await connect()).searchParams.get('state')!;
    expect(resultOf(await callback({ error: 'access_denied', state }))).toBe('negado');
    oauth.exchangeCode.mockRejectedValueOnce(new Error('invalid_grant'));
    state = (await connect()).searchParams.get('state')!;
    expect(resultOf(await callback({ code: 'a', state }))).toBe('falha');
    expect(await db.mercadoPagoAccount.count()).toBe(0);
  });

  it('retorno sem sessão: volta para a tela pedindo login (nunca 401 em JSON numa navegação)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/payments/mercadopago/callback?code=a&state=b' });
    expect(resultOf(res)).toBe('sessao');
    const bad = await app.inject({ method: 'GET', url: '/api/payments/mercadopago/callback', cookies: { [SESSION_COOKIE]: 'invalido' } });
    expect(resultOf(bad)).toBe('sessao');
  });

  it('desconectar apaga os tokens', async () => {
    await callback({ code: 'a', state: (await connect()).searchParams.get('state')! });
    expect((await as('DELETE', '/api/payments/mercadopago')).statusCode).toBe(204);
    expect((await as('GET', '/api/payments/mercadopago')).json().account).toBeNull();
  });

  it('só o organizador: secretaria não vê nem conecta', async () => {
    const sec = await actingAs(app, db, 'SECRETARY');
    expect((await sec('GET', '/api/payments/mercadopago')).statusCode).toBe(403);
    expect((await sec('POST', '/api/payments/mercadopago/connect', {})).statusCode).toBe(403);
    expect((await sec('DELETE', '/api/payments/mercadopago')).statusCode).toBe(403);
    expect(resultOf(await callback({ code: 'a', state: 'b' }, sec))).toBe('sessao');
  });
});

describe('access token para cobrar (renovação automática)', () => {
  const now = new Date('2027-01-01T12:00:00Z');
  async function account(expiresInMs: number) {
    await db.mercadoPagoAccount.create({
      data: {
        id: 1,
        mpUserId: '241983636',
        accessTokenEncrypted: encryptToken('APP_USR-access-1', KEY),
        refreshTokenEncrypted: encryptToken('TG-refresh-1', KEY),
        liveMode: true,
        expiresAt: new Date(now.getTime() + expiresInMs),
      },
    });
  }
  const token = (at = now) => getAccessToken(db, MP_CONFIG, oauth, at);

  it('sem conta conectada: 409 MP_NOT_CONNECTED', async () => {
    await expect(token()).rejects.toMatchObject({ code: 'MP_NOT_CONNECTED' });
  });

  it('longe de vencer: usa o atual, sem renovar', async () => {
    await account(REFRESH_BEFORE_MS + 60_000);
    expect(await token()).toBe('APP_USR-access-1');
    expect(oauth.refresh).not.toHaveBeenCalled();
  });

  it('perto de vencer: renova e guarda o NOVO refresh token (ele muda a cada renovação)', async () => {
    await account(REFRESH_BEFORE_MS - 60_000);
    expect(await token()).toBe('APP_USR-access-2');
    expect(oauth.refresh).toHaveBeenCalledWith('TG-refresh-1');
    // Na próxima, já usa o novo sem renovar de novo.
    expect(await token()).toBe('APP_USR-access-2');
    expect(oauth.refresh).toHaveBeenCalledTimes(1);
    const saved = await db.mercadoPagoAccount.findUniqueOrThrow({ where: { id: 1 } });
    expect(saved.refreshedAt?.toISOString()).toBe(now.toISOString());
  });

  it('dois pedidos ao mesmo tempo renovam UMA vez só (lock no banco)', async () => {
    await account(REFRESH_BEFORE_MS - 60_000);
    // Renovação lenta (100 ms): sem o lock, os três pedidos renovariam ao mesmo tempo.
    oauth.refresh.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(tokens(2)), 100)));
    expect(await Promise.all([token(), token(), token()])).toEqual(['APP_USR-access-2', 'APP_USR-access-2', 'APP_USR-access-2']);
    expect(oauth.refresh).toHaveBeenCalledTimes(1);
  });

  it('renovação falhou: segue com o token atual se ainda vale; vencido, pede reconexão', async () => {
    oauth.refresh.mockRejectedValue(new Error('invalid_grant'));
    await account(60_000);
    expect(await token()).toBe('APP_USR-access-1');
    await expect(token(new Date(now.getTime() + 120_000))).rejects.toMatchObject({ code: 'MP_RECONNECT_REQUIRED' });
  });
});
