import { hash } from '@node-rs/argon2';
import { type PrismaClient, type Role, createPrismaClient } from '@mxpro/db';
import { type AppDeps, buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { DEFAULT_TEST_DATABASE_URL } from './global-setup.ts';
import { TEST_ORIGIN } from './helpers.ts';

export const PASSWORD = 'senha-de-teste-123';
const url = process.env['TEST_DATABASE_URL'] ?? DEFAULT_TEST_DATABASE_URL;

export function testDb(): PrismaClient {
  return createPrismaClient(url);
}

/** Apaga os dados entre testes (o nome do banco contém "test": garantido no global-setup). */
export async function resetDb(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "oauth_states", "mercado_pago_accounts", "consents", "payment_webhook_events", "payments", "registrations", "race_config_versions", ' +
      '"heat_categories", "heats", "event_categories", "events", "categories", "championships", ' +
      '"sessions", "users", "settings" RESTART IDENTITY CASCADE',
  );
}

let passwordHash: string | undefined;
export async function createUser(db: PrismaClient, data: { email: string; role: Role; active?: boolean; name?: string }) {
  passwordHash ??= await hash(PASSWORD);
  return db.user.create({ data: { name: data.name ?? 'Usuário de Teste', passwordHash, ...data } });
}

export async function integrationApp(db: PrismaClient, env: Record<string, string> = {}, deps: Partial<Omit<AppDeps, 'config' | 'db'>> = {}) {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, CORS_ORIGINS: TEST_ORIGIN, ...env });
  return buildApp({ config, db, ...deps });
}

export const SESSION_COOKIE = 'mxpro_session';

/** Cria um usuário do perfil, faz login e devolve uma função para chamar a API como ele. */
export async function actingAs(app: Awaited<ReturnType<typeof integrationApp>>, db: PrismaClient, role: Role) {
  const email = `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@mxpro.test`;
  await createUser(db, { email, role });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  const token = login.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
  return (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { [SESSION_COOKIE]: token }, ...(payload ? { payload } : {}) });
}
