import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../src/errors.ts';
import { TEST_ORIGIN, fakeDb, testApp } from './helpers.ts';

type App = Awaited<ReturnType<typeof testApp>>;
let app: App;
afterEach(async () => app?.close());

describe('GET /api/health', () => {
  it('200 quando API e banco respondem', async () => {
    app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('503 "degradado" quando o banco não responde (sem expor o erro do banco)', async () => {
    app = await testApp(fakeDb({ $queryRaw: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5433')) }));
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degradado', database: 'indisponivel' });
    expect(res.body).not.toContain('ECONNREFUSED');
  });
});

describe('formato único de erro { code, message, details? }', () => {
  async function appWithRoutes() {
    const a = await testApp();
    a.get('/api/_t/app-error', () => {
      throw new AppError(409, 'RACE_NUMBER_TAKEN', 'Número de largada já usado nesta categoria.', { raceNumber: '27' });
    });
    a.get('/api/_t/zod', () => z.object({ email: z.email('E-mail inválido.') }).parse({ email: 'x' }));
    a.get('/api/_t/boom', () => {
      throw new Error('relation "users" does not exist — SELECT * FROM users');
    });
    a.post('/api/_t/echo', (req) => req.body);
    return a;
  }

  it('rota inexistente → 404 NOT_FOUND', async () => {
    app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: 'NOT_FOUND', message: 'Rota não encontrada: GET /api/nao-existe' });
  });

  it('AppError → status, código, mensagem e detalhes definidos por quem lançou', async () => {
    app = await appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/api/_t/app-error' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      code: 'RACE_NUMBER_TAKEN',
      message: 'Número de largada já usado nesta categoria.',
      details: { raceNumber: '27' },
    });
  });

  it('validação (Zod) → 400 com campo e mensagem', async () => {
    app = await appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/api/_t/zod' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos. Confira os campos destacados.',
      details: [{ field: 'email', message: 'E-mail inválido.' }],
    });
  });

  it('JSON malformado → 400 BAD_REQUEST', async () => {
    app = await appWithRoutes();
    const res = await app.inject({
      method: 'POST', url: '/api/_t/echo', headers: { 'content-type': 'application/json' }, payload: '{ruim',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BAD_REQUEST');
  });

  it('erro inesperado → 500 genérico, sem vazar SQL/stack', async () => {
    app = await appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/api/_t/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ code: 'INTERNAL_ERROR', message: 'Erro inesperado no servidor. Tente novamente em instantes.' });
    expect(res.body).not.toMatch(/SELECT|relation|stack/i);
  });
});

describe('segurança', () => {
  it('CORS libera só as origens configuradas, com credenciais', async () => {
    app = await testApp();
    const ok = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: TEST_ORIGIN } });
    expect(ok.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const evil = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://site-malicioso.com' } });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('envia cabeçalhos de segurança (helmet)', async () => {
    app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});
