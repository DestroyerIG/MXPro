import type { FastifyInstance } from 'fastify';
import {
  createChampionship,
  deleteChampionship,
  listChampionships,
  updateChampionship,
} from '../events/championships.service.ts';
import { idParam } from './params.ts';

const championshipId = (params: unknown) => idParam(params, 'CHAMPIONSHIP_NOT_FOUND', 'Campeonato não encontrado.');

/** Campeonatos. Organizador e secretaria consultam; só o organizador altera. */
export async function championshipRoutes(app: FastifyInstance): Promise<void> {
  const staff = app.requireRole('ORGANIZER', 'SECRETARY');
  const organizer = app.requireRole('ORGANIZER');

  app.get('/championships', { preHandler: staff }, async () => ({ championships: await listChampionships(app.db) }));

  app.post('/championships', { preHandler: organizer }, async (request, reply) => {
    const championship = await createChampionship(app.db, request.body ?? {});
    request.log.info({ userId: request.user?.id, championshipId: championship.id }, 'campeonato criado');
    return reply.status(201).send(championship);
  });

  app.patch('/championships/:id', { preHandler: organizer }, async (request) =>
    updateChampionship(app.db, championshipId(request.params), request.body ?? {}),
  );

  app.delete('/championships/:id', { preHandler: organizer }, async (request, reply) => {
    const id = championshipId(request.params);
    await deleteChampionship(app.db, id);
    request.log.info({ userId: request.user?.id, championshipId: id }, 'campeonato excluído');
    return reply.status(204).send();
  });
}
