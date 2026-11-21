import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@mxpro/db';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.ts';
import { registerAuth } from './auth/auth.plugin.ts';
import { registerErrorHandling } from './errors.ts';
import { type MercadoPagoOAuth, createMercadoPagoOAuth } from './payments/mercadopago/oauth-client.ts';
import { categoryRoutes } from './routes/categories.ts';
import { championshipRoutes } from './routes/championships.ts';
import { eventRoutes } from './routes/events.ts';
import { authRoutes } from './routes/auth.ts';
import { healthRoutes } from './routes/health.ts';
import { paymentRoutes } from './routes/payments.ts';
import { settingsRoutes } from './routes/settings.ts';
import { userRoutes } from './routes/users.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** Cliente do banco, disponível em todas as rotas como `app.db`. */
    db: PrismaClient;
    /** Integração com o Mercado Pago (null = não configurada). */
    mercadoPago: { config: AppConfig['mercadoPago']; oauth: MercadoPagoOAuth | null };
  }
}

export interface AppDeps {
  config: AppConfig;
  /** Injetado (e não criado aqui) para os testes poderem usar um banco falso. */
  db: PrismaClient;
  /** Chamadas OAuth ao Mercado Pago. Os testes injetam uma versão falsa (sem rede). */
  mercadoPagoOAuth?: MercadoPagoOAuth;
}

/**
 * Monta a aplicação SEM abrir porta: o server.ts chama listen(); os testes usam app.inject().
 * Rotas finas: validam entrada e chamam services (docs/arquitetura.md §6).
 */
export async function buildApp({ config, db, mercadoPagoOAuth }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.nodeEnv === 'test'
        ? false
        : {
            level: config.logLevel,
            // Nunca registrar cookie/senha/token nos logs.
            redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
            ...(config.nodeEnv === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
          },
    // Atrás de proxy reverso (HTTPS) o IP real vem do cabeçalho; necessário para limitar tentativas por IP.
    trustProxy: config.nodeEnv === 'production',
  });

  app.decorate('db', db);
  app.decorate('mercadoPago', {
    config: config.mercadoPago,
    oauth: config.mercadoPago ? (mercadoPagoOAuth ?? createMercadoPagoOAuth(config.mercadoPago)) : null,
  });
  registerErrorHandling(app);

  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true, // o login usa cookie httpOnly
  });
  // Limite de requisições: desligado por padrão, ligado rota a rota (ex.: login).
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({ statusCode: 429, code: 'RATE_LIMITED', message: 'Muitas tentativas.' }),
  });
  await registerAuth(app, config);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(userRoutes);
      await api.register(settingsRoutes);
      await api.register(championshipRoutes);
      await api.register(eventRoutes);
      await api.register(categoryRoutes);
      await api.register(paymentRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
