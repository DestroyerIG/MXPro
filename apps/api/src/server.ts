import { createPrismaClient } from '@mxpro/db';
import { config as loadDotenv } from 'dotenv';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

// .env da raiz do monorepo (em produção as variáveis vêm do ambiente; o arquivo nem existe).
loadDotenv({ path: new URL('../../../.env', import.meta.url), quiet: true });

const config = loadConfig(process.env);
const db = createPrismaClient(config.databaseUrl);
const app = await buildApp({ config, db });

// Desligamento limpo (Ctrl+C, deploy): para de aceitar conexões, termina as em andamento e fecha o banco.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} recebido, encerrando…`);
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
}

await app.listen({ host: config.host, port: config.port });
