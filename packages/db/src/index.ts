import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

export * from './generated/prisma/client.ts';

/**
 * Cria o cliente do banco. O Prisma 7 conversa com o Postgres por um "driver adapter"
 * (aqui o `pg`); a URL vem de quem chama (API, seed, testes), não de variável global.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** Linha única de configurações (single-tenant). */
export const SETTINGS_ID = 1;
