import { cancelEventSchema, eventListQuerySchema } from '@mxpro/shared';
import type { FastifyInstance } from 'fastify';
import {
  cancelEvent,
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  publishEvent,
  updateEvent,
} from '../events/events.service.ts';
import { getEventDashboard } from '../events/dashboard.service.ts';
import { idParam } from './params.ts';

const eventId = (params: unknown) => idParam(params, 'EVENT_NOT_FOUND', 'Evento não encontrado.');

/**
 * Eventos (etapas). Organizador e secretaria consultam; só o organizador cria, edita, publica,
 * cancela e exclui. As regras ficam no service; aqui só entrada, permissão e resposta.
 */
export async function eventRoutes(app: FastifyInstance): Promise<void> {
  const staff = app.requireRole('ORGANIZER', 'SECRETARY');
  const organizer = app.requireRole('ORGANIZER');

  app.get('/events', { preHandler: staff }, async (request) => {
    const filters = eventListQuerySchema.parse(request.query ?? {});
    return { events: await listEvents(app.db, filters, new Date()) };
  });

  app.get('/events/:id', { preHandler: staff }, async (request) => getEvent(app.db, eventId(request.params), new Date()));

  // Painel do evento (tela inicial do organizador/secretaria).
  app.get('/events/:id/dashboard', { preHandler: staff }, async (request) =>
    getEventDashboard(app.db, eventId(request.params), new Date()),
  );

  app.post('/events', { preHandler: organizer }, async (request, reply) => {
    const event = await createEvent(app.db, request.body ?? {}, new Date());
    request.log.info({ userId: request.user?.id, eventId: event.id }, 'evento criado');
    return reply.status(201).send(event);
  });

  app.patch('/events/:id', { preHandler: organizer }, async (request) =>
    updateEvent(app.db, eventId(request.params), request.body ?? {}, new Date()),
  );

  app.post('/events/:id/publish', { preHandler: organizer }, async (request) => {
    const event = await publishEvent(app.db, eventId(request.params), new Date());
    request.log.info({ userId: request.user?.id, eventId: event.id }, 'evento publicado');
    return event;
  });

  app.post('/events/:id/cancel', { preHandler: organizer }, async (request) => {
    const id = eventId(request.params);
    const { reason } = cancelEventSchema.parse(request.body ?? {});
    const event = await cancelEvent(app.db, id, new Date());
    // Quem cancelou e por quê fica no log (a trilha de auditoria completa vem com a cronometragem).
    request.log.warn({ userId: request.user?.id, eventId: id, reason }, 'evento cancelado');
    return event;
  });

  app.delete('/events/:id', { preHandler: organizer }, async (request, reply) => {
    const id = eventId(request.params);
    await deleteEvent(app.db, id);
    request.log.info({ userId: request.user?.id, eventId: id }, 'evento excluído');
    return reply.status(204).send();
  });
}
