import type { PrismaClient } from '@mxpro/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD, createUser, integrationApp, resetDb, testDb } from './db-helpers.ts';

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

async function sessionAs(role: 'ORGANIZER' | 'SECRETARY') {
  const email = `${role.toLowerCase()}@mxpro.test`;
  await createUser(db, { email, role });
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  return res.cookies.find((c) => c.name === COOKIE)!.value;
}
const getBranding = () => app.inject({ method: 'GET', url: '/api/settings/branding' });
const putBranding = (token: string | undefined, payload: unknown) =>
  app.inject({ method: 'PUT', url: '/api/settings/branding', payload: payload as object, ...(token ? { cookies: { [COOKIE]: token } } : {}) });

const NEW_BRAND = { brandName: 'TRILHA SUL', brandNameAccent: 'TRILHA', primaryColor: '#1C7ED6', logoUrl: 'https://cdn.exemplo.com.br/logo.png' };

describe('GET /api/settings/branding (público)', () => {
  it('sem configuração salva, devolve a marca padrão do escopo', async () => {
    const res = await getBranding();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      brandName: 'MXPRO', brandNameAccent: 'MX', primaryColor: '#E8590C', logoUrl: null, publicNameDisplay: 'FULL_NAME',
    });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('não exige login', async () => {
    expect((await getBranding()).statusCode).toBe(200);
  });
});

describe('PUT /api/settings/branding (somente organizador)', () => {
  it('organizador altera a marca e o GET público passa a devolvê-la', async () => {
    const token = await sessionAs('ORGANIZER');
    const res = await putBranding(token, NEW_BRAND);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject(NEW_BRAND);
    expect((await getBranding()).json()).toEqual({ ...NEW_BRAND, publicNameDisplay: 'FULL_NAME' });
    expect(await db.settings.count()).toBe(1);
  });

  it('salvar duas vezes mantém uma única linha (single-tenant)', async () => {
    const token = await sessionAs('ORGANIZER');
    await putBranding(token, NEW_BRAND);
    await putBranding(token, { ...NEW_BRAND, primaryColor: '#C92A2A' });
    expect(await db.settings.count()).toBe(1);
    expect((await getBranding()).json().primaryColor).toBe('#C92A2A');
  });

  it('dados inválidos: 400 com mensagem por campo e nada é gravado', async () => {
    const token = await sessionAs('ORGANIZER');
    const res = await putBranding(token, { ...NEW_BRAND, primaryColor: 'azul' });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual([{ field: 'primaryColor', message: 'Use uma cor no formato #RRGGBB, ex.: #E8590C.' }]);
    expect(await db.settings.count()).toBe(0);
  });

  it('secretaria logada: 403; anônimo: 401', async () => {
    expect((await putBranding(await sessionAs('SECRETARY'), NEW_BRAND)).statusCode).toBe(403);
    expect((await putBranding(undefined, NEW_BRAND)).statusCode).toBe(401);
    expect(await db.settings.count()).toBe(0);
  });
});
