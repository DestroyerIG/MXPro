import cookie from '@fastify/cookie';
import type { Role, SessionUser } from '@mxpro/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.ts';
import { AppError } from '../errors.ts';
import { AuthService } from './auth.service.ts';
import { sessionCookieName } from './session-token.ts';

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyInstance {
    auth: AuthService;
    /** preHandler: exige sessão válida e preenche `request.user`. */
    authenticate: PreHandler;
    /** preHandler: exige sessão válida E um dos perfis informados (autorização no backend, §1). */
    requireRole: (...roles: Role[]) => PreHandler;
    setSessionCookie: (reply: FastifyReply, token: string, expiresAt: Date) => void;
    clearSessionCookie: (reply: FastifyReply) => void;
    sessionCookie: string;
  }
  interface FastifyRequest {
    user: SessionUser | null;
    /** Validade da sessão desta requisição (já considerando a renovação). */
    sessionExpiresAt: Date | null;
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Autenticação por sessão em cookie httpOnly (decisão do projeto: ver README/arquitetura).
 * Registrado no nível raiz (sem encapsular) para que todas as rotas vejam os decoradores.
 */
export async function registerAuth(app: FastifyInstance, config: AppConfig): Promise<void> {
  await app.register(cookie);

  const cookieName = sessionCookieName(config.cookieSecure);
  const allowedOrigins = new Set(config.corsOrigins);

  app.decorate('sessionCookie', cookieName);
  app.decorate('auth', new AuthService(app.db, config.sessionTtlMs));
  app.decorateRequest('user', null);
  app.decorateRequest('sessionExpiresAt', null);

  app.decorate('setSessionCookie', (reply: FastifyReply, token: string, expiresAt: Date) => {
    reply.setCookie(cookieName, token, {
      httpOnly: true, // o JavaScript da página não lê o cookie (protege contra roubo por XSS)
      secure: config.cookieSecure,
      sameSite: 'lax', // não vai em requisições POST vindas de outros sites (CSRF)
      path: '/',
      expires: expiresAt,
    });
  });
  app.decorate('clearSessionCookie', (reply: FastifyReply) => {
    reply.clearCookie(cookieName, { path: '/', httpOnly: true, secure: config.cookieSecure, sameSite: 'lax' });
  });

  // Defesa extra contra CSRF: requisição que altera dados vinda de outra origem é recusada,
  // mesmo que algum navegador antigo envie o cookie.
  app.addHook('onRequest', async (request) => {
    const origin = request.headers.origin;
    if (UNSAFE_METHODS.has(request.method) && origin && !allowedOrigins.has(origin)) {
      throw new AppError(403, 'CSRF_ORIGIN', 'Origem da requisição não autorizada.');
    }
  });

  const authenticate: PreHandler = async (request, reply) => {
    const token = request.cookies[cookieName];
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
    const session = await app.auth.resolve(token);
    if (!session) {
      app.clearSessionCookie(reply);
      throw new AppError(401, 'UNAUTHENTICATED', 'Sua sessão expirou. Faça login novamente.');
    }
    request.user = session.user;
    request.sessionExpiresAt = session.expiresAt;
    if (session.renewed) app.setSessionCookie(reply, token, session.expiresAt);
  };
  app.decorate('authenticate', authenticate);

  app.decorate('requireRole', (...roles: Role[]): PreHandler => async (request, reply) => {
    await authenticate(request, reply);
    if (!request.user || !roles.includes(request.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Seu perfil não tem permissão para esta ação.');
    }
  });
}
