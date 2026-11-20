import type { FastifyInstance } from 'fastify';

/**
 * GET /api/health — usado por monitoramento e pelo front para saber se a API e o banco respondem.
 * 200 = tudo ok; 503 = API no ar, mas banco indisponível.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    let database: 'ok' | 'indisponivel' = 'ok';
    try {
      await app.db.$queryRaw`SELECT 1`;
    } catch (err) {
      app.log.warn({ err }, 'health: banco indisponível');
      database = 'indisponivel';
    }
    const ok = database === 'ok';
    return reply.status(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'degradado',
      database,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });
}
