import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../events/categories.service.ts';
import { addEventCategory, listEventCategories, removeEventCategory, updateEventCategory } from '../events/event-categories.service.ts';
import { createHeat, deleteHeat, listHeats, updateHeat } from '../events/heats.service.ts';
import { idParam } from './params.ts';

const categoryId = (p: unknown) => idParam(p, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
const eventId = (p: unknown) => idParam(p, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
const eventCategoryId = (p: unknown) =>
  idParam(p, 'EVENT_CATEGORY_NOT_FOUND', 'Categoria não encontrada neste evento.', 'eventCategoryId');
const heatId = (p: unknown) => idParam(p, 'HEAT_NOT_FOUND', 'Bateria não encontrada neste evento.', 'heatId');

const listQuery = z.object({ active: z.enum(['true', 'false']).optional() });

/**
 * Catálogo de categorias, categorias de cada evento e baterias.
 * Organizador e secretaria consultam; só o organizador altera.
 */
export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  const staff = app.requireRole('ORGANIZER', 'SECRETARY');
  const organizer = app.requireRole('ORGANIZER');

  // ─── Catálogo ───
  app.get('/categories', { preHandler: staff }, async (request) => {
    const { active } = listQuery.parse(request.query ?? {});
    return { categories: await listCategories(app.db, { active: active === undefined ? undefined : active === 'true' }) };
  });
  app.post('/categories', { preHandler: organizer }, async (request, reply) =>
    reply.status(201).send(await createCategory(app.db, request.body ?? {})),
  );
  app.patch('/categories/:id', { preHandler: organizer }, async (request) =>
    updateCategory(app.db, categoryId(request.params), request.body ?? {}),
  );
  app.delete('/categories/:id', { preHandler: organizer }, async (request, reply) => {
    await deleteCategory(app.db, categoryId(request.params));
    return reply.status(204).send();
  });

  // ─── Categorias do evento ───
  app.get('/events/:id/categories', { preHandler: staff }, async (request) => ({
    categories: await listEventCategories(app.db, eventId(request.params)),
  }));
  app.post('/events/:id/categories', { preHandler: organizer }, async (request, reply) =>
    reply.status(201).send(await addEventCategory(app.db, eventId(request.params), request.body ?? {})),
  );
  app.patch('/events/:id/categories/:eventCategoryId', { preHandler: organizer }, async (request) =>
    updateEventCategory(app.db, eventId(request.params), eventCategoryId(request.params), request.body ?? {}),
  );
  app.delete('/events/:id/categories/:eventCategoryId', { preHandler: organizer }, async (request, reply) => {
    await removeEventCategory(app.db, eventId(request.params), eventCategoryId(request.params));
    return reply.status(204).send();
  });

  // ─── Baterias ───
  app.get('/events/:id/heats', { preHandler: staff }, async (request) => ({
    heats: await listHeats(app.db, eventId(request.params)),
  }));
  app.post('/events/:id/heats', { preHandler: organizer }, async (request, reply) =>
    reply.status(201).send(await createHeat(app.db, eventId(request.params), request.body ?? {})),
  );
  app.patch('/events/:id/heats/:heatId', { preHandler: organizer }, async (request) =>
    updateHeat(app.db, eventId(request.params), heatId(request.params), request.body ?? {}),
  );
  app.delete('/events/:id/heats/:heatId', { preHandler: organizer }, async (request, reply) => {
    await deleteHeat(app.db, eventId(request.params), heatId(request.params));
    return reply.status(204).send();
  });
}
