import { hash } from '@node-rs/argon2';
import { type PrismaClient, type Role, createPrismaClient } from '@mxpro/db';
import { buildApp } from '../src/app.ts';
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
  await db.$executeRawUnsafe('TRUNCATE TABLE "sessions", "users", "settings" RESTART IDENTITY CASCADE');
}

let passwordHash: string | undefined;
export async function createUser(db: PrismaClient, data: { email: string; role: Role; active?: boolean; name?: string }) {
  passwordHash ??= await hash(PASSWORD);
  return db.user.create({ data: { name: data.name ?? 'Usuário de Teste', passwordHash, ...data } });
}

export async function integrationApp(db: PrismaClient, env: Record<string, string> = {}) {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, CORS_ORIGINS: TEST_ORIGIN, ...env });
  return buildApp({ config, db });
}
