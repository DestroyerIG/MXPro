import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// O Prisma 7 não lê o .env sozinho: carregamos o .env da RAIZ do monorepo.
config({ path: new URL('../../.env', import.meta.url) });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
