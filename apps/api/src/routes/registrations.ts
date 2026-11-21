import type { FastifyInstance } from 'fastify';
import {
  createRegistration,
  getPublicEvent,
  getRegistration,
  listMyRegistrations,
  renewPix,
} from '../registrations/registrations.service.ts';
import { idParam } from './params.ts';
import { pixDeps } from './payments.ts';

const eventId = (p: unknown) => idParam(p, 'EVENT_NOT_FOUND', 'Evento não encontrado ou ainda não publicado.');
const registrationId = (p: unknown) => idParam(p, 'REGISTRATION_NOT_FOUND', 'Inscrição não encontrada.');

/**
 * Inscrições (ADR 0004).
 * - Públicas (sem login): a página do evento e a inscrição, que cria a conta do piloto na primeira vez.
 * - Do piloto: acompanhar a inscrição (tela "Aguardando pagamento"), gerar o Pix de novo e listar as suas.
 */
export async function registrationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/events/:id', async (request, reply) => {
    // Cache curto: muitos celulares abrindo o link do evento ao mesmo tempo. Vagas são revalidadas na inscrição.
    reply.header('cache-control', 'public, max-age=15');
    return getPublicEvent(app.db, eventId(request.params), app.now());
  });

  app.post(
    '/public/events/:id/registrations',
    // Limite por IP: cria conta e reserva vaga (evita robô ocupando todas as vagas).
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      // Login é opcional aqui: quem já tem conta entra antes; quem não tem cria na própria inscrição.
      const token = request.cookies[app.sessionCookie];
      const session = token ? await app.auth.resolve(token) : null;
      const meta = { ip: request.ip, userAgent: request.headers['user-agent'] };
      const { response, session: created } = await createRegistration(
        { db: app.db, auth: app.auth, pix: pixDeps(app) },
        eventId(request.params),
        request.body ?? {},
        { user: session?.user ?? null, meta, now: app.now() },
      );
      if (created) app.setSessionCookie(reply, created.token, created.expiresAt);
      request.log.info(
        { registrationId: response.registration.id, userId: session?.user.id ?? created?.user.id, newAccount: Boolean(created) },
        'inscrição criada',
      );
      return reply.status(201).send(response);
    },
  );

  app.get('/registrations/:id', { preHandler: app.authenticate }, async (request) =>
    getRegistration(pixDeps(app), registrationId(request.params), request.user!, app.now()),
  );

  app.post('/registrations/:id/pix', { preHandler: app.requireRole('PILOT') }, async (request) =>
    renewPix(pixDeps(app), registrationId(request.params), request.user!, app.now()),
  );

  app.get('/me/registrations', { preHandler: app.requireRole('PILOT') }, async (request) => ({
    registrations: await listMyRegistrations(app.db, request.user!.id, app.now()),
  }));
}
