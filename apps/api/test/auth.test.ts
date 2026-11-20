import type { PrismaClient } from '@mxpro/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashSessionToken } from '../src/auth/session-token.ts';
import { PASSWORD, createUser, integrationApp, resetDb, testDb } from './db-helpers.ts';
import { TEST_ORIGIN } from './helpers.ts';

const COOKIE = 'mxpro_session';
let db: PrismaClient;
let app: Awaited<ReturnType<typeof integrationApp>>;

beforeAll(() => {
  db = testDb();
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await app?.close();
  await resetDb(db);
  app = await integrationApp(db);
});

function login(email: string, password = PASSWORD) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
}
function sessionCookieOf(res: Awaited<ReturnType<typeof login>>) {
  return res.cookies.find((c) => c.name === COOKIE);
}

describe('POST /api/auth/login', () => {
  it('com e-mail e senha corretos: 200, usuário (sem hash) e cookie httpOnly/SameSite=Lax', async () => {
    await createUser(db, { email: 'org@mxpro.test', role: 'ORGANIZER', name: 'Marina Duarte' });
    const res = await login('org@mxpro.test');

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ email: 'org@mxpro.test', name: 'Marina Duarte', role: 'ORGANIZER' });
    expect(res.body).not.toContain('passwordHash');
    expect(res.body).not.toContain('argon2');

    const cookie = sessionCookieOf(res)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie.value.length).toBeGreaterThanOrEqual(43); // 256 bits em base64url
  });

  it('o banco guarda só o HASH do token, nunca o token do cookie', async () => {
    await createUser(db, { email: 'org@mxpro.test', role: 'ORGANIZER' });
    const token = sessionCookieOf(await login('org@mxpro.test'))!.value;
    const [session] = await db.session.findMany();
    expect(session!.id).not.toBe(token);
    expect(session!.id).toBe(hashSessionToken(token));
  });

  it('aceita e-mail com maiúsculas e espaços (normaliza)', async () => {
    await createUser(db, { email: 'org@mxpro.test', role: 'ORGANIZER' });
    expect((await login('  Org@MXPRO.test ')).statusCode).toBe(200);
  });

  it('senha errada e e-mail inexistente dão a MESMA resposta (não revela quem está cadastrado)', async () => {
    await createUser(db, { email: 'org@mxpro.test', role: 'ORGANIZER' });
    const wrongPassword = await login('org@mxpro.test', 'errada');
    const unknownEmail = await login('ninguem@mxpro.test');
    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' });
      expect(sessionCookieOf(res)).toBeUndefined();
    }
  });

  it('dados inválidos: 400 com mensagens em português por campo', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x', password: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual([
      { field: 'email', message: 'Informe um e-mail válido.' },
      { field: 'password', message: 'Informe a senha.' },
    ]);
  });

  it('usuário desativado não entra', async () => {
    await createUser(db, { email: 'ex@mxpro.test', role: 'SECRETARY', active: false });
    const res = await login('ex@mxpro.test');
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('USER_INACTIVE');
  });

  it('limita tentativas por IP: a 11ª em 15 min recebe 429', async () => {
    for (let i = 0; i < 10; i++) expect((await login('x@mxpro.test', 'errada')).statusCode).toBe(401);
    const res = await login('x@mxpro.test', 'errada');
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde um pouco e tente de novo.' });
  });
});

describe('sessão: /api/auth/me e /api/auth/logout', () => {
  async function loggedIn(role: 'ORGANIZER' | 'TIMEKEEPER' = 'ORGANIZER') {
    await createUser(db, { email: `${role.toLowerCase()}@mxpro.test`, role });
    return sessionCookieOf(await login(`${role.toLowerCase()}@mxpro.test`))!.value;
  }
  const me = (token?: string) =>
    app.inject({ method: 'GET', url: '/api/auth/me', ...(token ? { cookies: { [COOKIE]: token } } : {}) });

  it('sem cookie: 401 UNAUTHENTICATED', async () => {
    const res = await me();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'Faça login para continuar.' });
  });

  it('com cookie válido: devolve o usuário e a validade', async () => {
    const res = await me(await loggedIn());
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe('ORGANIZER');
    expect(new Date(res.json().expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('cookie inventado: 401 e o cookie é apagado no navegador', async () => {
    const res = await me('token-inventado-por-um-atacante');
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Sua sessão expirou. Faça login novamente.');
    expect(sessionCookieOf(res)?.value).toBe('');
  });

  it('logout apaga a sessão no banco: o mesmo cookie deixa de valer na hora', async () => {
    const token = await loggedIn();
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { [COOKIE]: token } });
    expect(out.statusCode).toBe(204);
    expect(await db.session.count()).toBe(0);
    expect((await me(token)).statusCode).toBe(401);
  });

  it('sessão vencida: 401 e a linha é removida', async () => {
    const token = await loggedIn();
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await me(token)).statusCode).toBe(401);
    expect(await db.session.count()).toBe(0);
  });

  it('usuário desativado depois do login perde o acesso imediatamente', async () => {
    const token = await loggedIn();
    await db.user.updateMany({ data: { active: false } });
    expect((await me(token)).statusCode).toBe(401);
  });

  it('renova a sessão (e reenvia o cookie) quando passou da metade da validade', async () => {
    const token = await loggedIn();
    const soon = new Date(Date.now() + 60 * 60_000); // falta 1 h de 12 h
    await db.session.updateMany({ data: { expiresAt: soon } });
    const res = await me(token);
    expect(res.statusCode).toBe(200);
    expect(new Date(res.json().expiresAt).getTime()).toBeGreaterThan(soon.getTime() + 10 * 60 * 60_000);
    expect(sessionCookieOf(res)?.value).toBe(token);
  });
});

describe('autorização por perfil (no backend)', () => {
  it('GET /api/users: organizador vê a equipe (sem hash de senha)', async () => {
    await createUser(db, { email: 'org@mxpro.test', role: 'ORGANIZER' });
    await createUser(db, { email: 'crono@mxpro.test', role: 'TIMEKEEPER' });
    const token = sessionCookieOf(await login('org@mxpro.test'))!.value;
    const res = await app.inject({ method: 'GET', url: '/api/users', cookies: { [COOKIE]: token } });
    expect(res.statusCode).toBe(200);
    expect(res.json().users).toHaveLength(2);
    expect(res.body).not.toMatch(/passwordHash|argon2/);
  });

  it('GET /api/users: cronometrista logado recebe 403 FORBIDDEN', async () => {
    await createUser(db, { email: 'crono@mxpro.test', role: 'TIMEKEEPER' });
    const token = sessionCookieOf(await login('crono@mxpro.test'))!.value;
    const res = await app.inject({ method: 'GET', url: '/api/users', cookies: { [COOKIE]: token } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ code: 'FORBIDDEN', message: 'Seu perfil não tem permissão para esta ação.' });
  });

  it('GET /api/users: anônimo recebe 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/users' })).statusCode).toBe(401);
  });
});

describe('CSRF', () => {
  it('POST vindo de outra origem é recusado antes de chegar na rota', async () => {
    await createUser(db, { email: 'org@mxpro.test', role: 'ORGANIZER' });
    const token = sessionCookieOf(await login('org@mxpro.test'))!.value;
    const res = await app.inject({
      method: 'POST', url: '/api/auth/logout', cookies: { [COOKIE]: token }, headers: { origin: 'https://site-malicioso.com' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('CSRF_ORIGIN');
    expect(await db.session.count()).toBe(1); // a sessão continua lá
  });

  it('POST da origem do front é aceito', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: TEST_ORIGIN } });
    expect(res.statusCode).toBe(204);
  });
});
