import type { MercadoPagoConnectResponse, MercadoPagoConnectResult } from '@mxpro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { disconnect, finishConnection, getConnection, startConnection } from '../payments/mercadopago/connection.service.ts';

/** Para onde o navegador volta depois do retorno do OAuth (a tela Financeiro mostra o resultado). */
const FINANCE_PAGE = '/painel/financeiro';

const callbackQuery = z.object({
  code: z.string().max(512).optional(),
  state: z.string().max(256).optional(),
  error: z.string().max(256).optional(),
});

/**
 * Conta do Mercado Pago que recebe as inscrições (ADR 0005). Só o organizador vê e altera:
 * é a conta bancária do contratante.
 */
export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  const organizer = app.requireRole('ORGANIZER');

  app.get('/payments/mercadopago', { preHandler: organizer }, async () => getConnection(app.db, app.mercadoPago.config));

  app.post('/payments/mercadopago/connect', { preHandler: organizer }, async (request): Promise<MercadoPagoConnectResponse> => ({
    authorizationUrl: await startConnection(app.db, app.mercadoPago.config, request.user!.id),
  }));

  // Retorno do Mercado Pago: é uma NAVEGAÇÃO do navegador (não uma chamada da tela). Por isso nunca
  // responde JSON: sempre redireciona para a tela Financeiro com o resultado em ?mercadopago=.
  app.get('/payments/mercadopago/callback', async (request, reply) => {
    const back = (result: MercadoPagoConnectResult) => reply.redirect(`${FINANCE_PAGE}?mercadopago=${result}`, 303);
    try {
      await organizer(request, reply);
    } catch {
      return back('sessao');
    }
    const query = callbackQuery.safeParse(request.query ?? {});
    if (!query.success) return back('expirado');
    const result = await finishConnection(app.db, app.mercadoPago.config, app.mercadoPago.oauth, query.data, request.user!.id);
    // Nunca registrar code/state/tokens: só quem e o resultado.
    request.log.info({ userId: request.user!.id, result }, 'conexão com o Mercado Pago');
    return back(result);
  });

  app.delete('/payments/mercadopago', { preHandler: organizer }, async (request, reply) => {
    await disconnect(app.db);
    request.log.info({ userId: request.user!.id }, 'conta do Mercado Pago desconectada');
    return reply.status(204).send();
  });
}
