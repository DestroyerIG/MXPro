import type { PrismaClient } from '@mxpro/db';
import { vi } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

export const TEST_ORIGIN = 'http://localhost:4200';

/** Banco falso: só o que cada teste precisa. */
export function fakeDb(overrides: Record<string, unknown> = {}): PrismaClient {
  return { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]), ...overrides } as unknown as PrismaClient;
}

export async function testApp(db: PrismaClient = fakeDb()) {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://t:t@localhost:1/t', CORS_ORIGINS: TEST_ORIGIN });
  return buildApp({ config, db });
}
