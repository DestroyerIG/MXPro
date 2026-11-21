import { createPrismaClient } from '@mxpro/db';
import { config as loadDotenv } from 'dotenv';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

// .env da raiz do monorepo (em produção as variáveis vêm do ambiente; o arquivo nem existe).
loadDotenv({ path: new URL('../../../.env', import.meta.url), quiet: true });

const config = loadConfig(process.env);
const db = createPrismaClient(config.databaseUrl);
const app = await buildApp({ config, db });

async function shutdown(): Promise<void> {
  await app.close();
  await db.$disconnect();
}

// Desligamento limpo (Ctrl+C, deploy): para de aceitar conexões, termina as em andamento e fecha o banco.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} recebido, encerrando…`);
    // process.once não espera promessas: o fim (e uma eventual falha ao fechar) é tratado aqui mesmo.
    shutdown().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error(err, 'falha ao encerrar');
        process.exit(1);
      },
    );
  });
}

await app.listen({ host: config.host, port: config.port });
