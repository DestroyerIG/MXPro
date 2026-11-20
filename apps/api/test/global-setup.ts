import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@mxpro/db';

/**
 * Antes de todos os testes: garante o banco de TESTES (separado do de desenvolvimento) e aplica as
 * migrations. Em CI, TEST_DATABASE_URL aponta para o Postgres do pipeline.
 */
export const DEFAULT_TEST_DATABASE_URL = 'postgresql://mxpro:mxpro_dev@localhost:5433/mxpro_test?schema=public';

export default async function setup(): Promise<void> {
  const url = process.env['TEST_DATABASE_URL'] ?? DEFAULT_TEST_DATABASE_URL;
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName) || !dbName.includes('test')) {
    throw new Error(`Banco de testes inválido: "${dbName}". O nome deve conter "test" (proteção contra apagar dados reais).`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = createPrismaClient(adminUrl.toString());
  try {
    const rows = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync('pnpm exec prisma migrate deploy', {
    cwd: fileURLToPath(new URL('../../../packages/db', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  process.env['TEST_DATABASE_URL'] = url;
}
