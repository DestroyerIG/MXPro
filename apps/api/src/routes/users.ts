import type { FastifyInstance } from 'fastify';

/** Equipe da organização. Só o organizador vê (exemplo de autorização por perfil no backend). */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users', { preHandler: app.requireRole('ORGANIZER') }, async () => {
    const users = await app.db.user.findMany({
      // select explícito: o hash da senha NUNCA sai da API.
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    return { users };
  });
}
