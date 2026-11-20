import { loginRequestSchema, type SessionResponse } from '@mxpro/shared';
import type { FastifyInstance } from 'fastify';

/** Login, logout e "quem sou eu". Rotas finas: validam e delegam ao AuthService. */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/auth/login',
    // Limite por IP contra tentativa de adivinhar senhas (docs/arquitetura.md §5.7).
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { email, password } = loginRequestSchema.parse(request.body ?? {});
      const result = await app.auth.login(email, password, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
      app.setSessionCookie(reply, result.token, result.expiresAt);
      return { user: result.user, expiresAt: result.expiresAt.toISOString() } satisfies SessionResponse;
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[app.sessionCookie];
    if (token) await app.auth.logout(token);
    app.clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => {
    // `user` e `sessionExpiresAt` foram preenchidos pelo authenticate (uma consulta só ao banco).
    return { user: request.user!, expiresAt: request.sessionExpiresAt!.toISOString() } satisfies SessionResponse;
  });
}
