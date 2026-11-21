import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@mxpro/db';
import type { PixChargeDto } from '@mxpro/shared';
import type { MercadoPagoConfig } from '../config.ts';
import { AppError } from '../errors.ts';
import { getAccessToken } from './mercadopago/connection.service.ts';
import type { MercadoPagoOAuth } from './mercadopago/oauth-client.ts';
import { type MercadoPagoOrder, type MercadoPagoOrders, amountToCents } from './mercadopago/orders-client.ts';
import { verifyWebhookSignature } from './mercadopago/webhook-signature.ts';

/**
 * Cobranças Pix das inscrições no Mercado Pago do contratante (ADRs 0004 e 0005).
 *
 * Regra de ouro: quem diz que um Pix foi pago é o MERCADO PAGO, consultado por nós com o token do
 * vendedor (`GET /v1/orders/{id}`). O conteúdo do webhook só diz "olhe este pedido"; a tela do
 * piloto também pode pedir uma consulta. Os dois caminhos chegam em `applyOrder`, que é idempotente:
 * aplicar o mesmo estado duas vezes não muda nada.
 */

export const PROVIDER = 'mercadopago';
/** Validade do Pix = reserva da vaga (ADR 0004). É também o mínimo aceito pelo Mercado Pago. */
export const PIX_TTL_MINUTES = 30;
/** Tolerância de relógio do webhook (aviso mais antigo que isso é recusado: proteção contra reenvio). */
const WEBHOOK_TOLERANCE_SECONDS = 10 * 60;

export interface PixDeps {
  db: PrismaClient;
  config: MercadoPagoConfig | null;
  oauth: MercadoPagoOAuth | null;
  orders: MercadoPagoOrders | null;
  now?: () => Date;
}

type Outcome = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELED' | 'REFUNDED';

/**
 * Estado do pedido no Mercado Pago → o que significa para nós (tabela de status da API de Orders).
 * Pix vencido não tem status próprio: vem como canceled/expired (ou failed/expired).
 */
export function orderOutcome(order: Pick<MercadoPagoOrder, 'status' | 'status_detail'>): Outcome {
  switch (order.status) {
    case 'processed': // accredited (ou partially_refunded: segue pago)
      return 'PAID';
    case 'refunded':
    case 'charged_back':
      return 'REFUNDED';
    case 'canceled':
    case 'failed':
      return order.status_detail === 'expired' ? 'EXPIRED' : 'CANCELED';
    default: // created, processing, action_required (aguardando a transferência)
      return 'PENDING';
  }
}

function toDto(p: { id: string; status: PixChargeDto['status']; amountCents: number; pixCopyPaste: string; expiresAt: Date }): PixChargeDto {
  return { paymentId: p.id, status: p.status, amountCents: p.amountCents, pixCopyPaste: p.pixCopyPaste, expiresAt: p.expiresAt.toISOString() };
}

function requireMercadoPago(deps: PixDeps) {
  if (!deps.config || !deps.oauth || !deps.orders) {
    throw new AppError(409, 'MP_NOT_CONFIGURED', 'O pagamento por Pix ainda não está disponível. Fale com a organização do evento.');
  }
  return { config: deps.config, oauth: deps.oauth, orders: deps.orders };
}

const mpUnavailable = () =>
  new AppError(502, 'MP_UNAVAILABLE', 'Não foi possível falar com o Mercado Pago agora. Tente de novo em instantes.');

/**
 * Gera (ou devolve, se ainda vale) o Pix de uma inscrição aguardando pagamento.
 * A reserva da vaga passa a valer até o vencimento do Pix.
 */
export async function createPixCharge(deps: PixDeps, registrationId: string): Promise<PixChargeDto> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const reg = await db.registration.findUnique({
    where: { id: registrationId },
    include: {
      pilot: { select: { email: true } },
      event: { select: { name: true } },
      eventCategory: { select: { category: { select: { name: true } } } },
      payments: { where: { status: 'PENDING' } },
    },
  });
  if (!reg) throw new AppError(404, 'REGISTRATION_NOT_FOUND', 'Inscrição não encontrada.');
  if (reg.status !== 'PENDING_PAYMENT') {
    throw new AppError(409, 'REGISTRATION_NOT_PENDING', 'Esta inscrição não está aguardando pagamento.');
  }
  const open = reg.payments[0];
  if (open && open.expiresAt > now) return toDto(open); // o Pix atual ainda vale: o mesmo QR Code
  if (!reg.holdExpiresAt || reg.holdExpiresAt <= now) {
    throw new AppError(409, 'HOLD_EXPIRED', 'O prazo para pagar esta inscrição terminou. Faça a inscrição de novo para gerar outro Pix.');
  }
  const mp = requireMercadoPago(deps);
  const token = await getAccessToken(db, mp.config, mp.oauth, now);

  // O id do nosso pagamento é a chave de idempotência: se a resposta se perder e o pedido for
  // repetido, o Mercado Pago devolve o MESMO Pix em vez de criar outro.
  const paymentId = randomUUID();
  let order: MercadoPagoOrder;
  try {
    order = await mp.orders.createPixOrder(token, {
      idempotencyKey: paymentId,
      externalReference: reg.id,
      amountCents: reg.entryFeeCents,
      description: `Inscrição ${reg.eventCategory.category.name} - ${reg.event.name}`.slice(0, 120),
      payerEmail: reg.pilot.email,
      expiresInMinutes: PIX_TTL_MINUTES,
    });
  } catch {
    throw mpUnavailable();
  }
  const pixCopyPaste = order.transactions?.payments?.[0]?.payment_method?.qr_code;
  if (!pixCopyPaste) throw mpUnavailable();

  const expiresAt = new Date(now.getTime() + PIX_TTL_MINUTES * 60_000);
  const payment = await db.$transaction(async (tx) => {
    // Pix anterior vencido: sai de "em aberto" (o banco só aceita um em aberto por inscrição).
    if (open) await tx.payment.update({ where: { id: open.id }, data: { status: 'EXPIRED' } });
    const created = await tx.payment.create({
      data: {
        id: paymentId,
        registrationId: reg.id,
        provider: PROVIDER,
        providerChargeId: order.id,
        amountCents: reg.entryFeeCents,
        pixCopyPaste,
        expiresAt,
        lastCheckedAt: now,
      },
    });
    await tx.registration.update({ where: { id: reg.id }, data: { holdExpiresAt: expiresAt } });
    return created;
  });
  return toDto(payment);
}

/** O que `applyOrder` fez (vai para o log e para os testes). */
export type ApplyResult = 'unchanged' | 'paid' | 'paid-no-slot' | 'expired' | 'canceled' | 'refunded' | 'amount-mismatch';

/**
 * Aplica o estado do pedido (lido do Mercado Pago) ao pagamento e à inscrição.
 * O pagamento fica travado (`FOR UPDATE`) durante a mudança: webhook e consulta da tela chegando
 * juntos não confirmam a inscrição duas vezes.
 */
export async function applyOrder(db: PrismaClient, paymentId: string, order: MercadoPagoOrder, now: Date): Promise<ApplyResult> {
  const outcome = orderOutcome(order);
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "payments" WHERE "id" = ${paymentId}::uuid FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { registration: true } });
    if (payment.providerChargeId !== order.id) throw new Error('Pedido do Mercado Pago não corresponde ao pagamento.');
    await tx.payment.update({ where: { id: payment.id }, data: { lastCheckedAt: now } });
    const reg = payment.registration;

    switch (outcome) {
      case 'PENDING':
        return 'unchanged' as const;

      case 'PAID': {
        if (payment.status === 'PAID') return 'unchanged' as const;
        // Confere o valor pago (nunca confirma pagamento a menor).
        const paid = amountToCents(order.total_paid_amount ?? order.total_amount ?? '');
        if (paid === null || paid < payment.amountCents) return 'amount-mismatch' as const;
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', paidAt: now } });
        if (reg.status === 'PENDING_PAYMENT') {
          await tx.registration.update({
            where: { id: reg.id },
            data: { status: 'CONFIRMED', confirmedAt: now, holdExpiresAt: null },
          });
          return 'paid' as const;
        }
        // Pago depois de a reserva vencer (ou de a inscrição ser cancelada): decidido fora desta
        // transação, porque reocupar a vaga pode esbarrar no índice único do nº de largada.
        return reg.status === 'EXPIRED' ? ('paid-no-slot' as const) : ('paid' as const);
      }

      case 'EXPIRED':
      case 'CANCELED': {
        if (payment.status !== 'PENDING') return 'unchanged' as const;
        await tx.payment.update({ where: { id: payment.id }, data: { status: outcome } });
        const otherOpen = await tx.payment.count({ where: { registrationId: reg.id, status: 'PENDING', id: { not: payment.id } } });
        if (reg.status === 'PENDING_PAYMENT' && otherOpen === 0) {
          await tx.registration.update({ where: { id: reg.id }, data: { status: 'EXPIRED', holdExpiresAt: null } });
        }
        return outcome === 'EXPIRED' ? ('expired' as const) : ('canceled' as const);
      }

      case 'REFUNDED': {
        if (payment.status === 'REFUNDED') return 'unchanged' as const;
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', paidAt: payment.paidAt ?? now } });
        if (reg.status === 'CONFIRMED') await tx.registration.update({ where: { id: reg.id }, data: { status: 'CANCELED' } });
        return 'refunded' as const;
      }
    }
  });

  if (result === 'paid-no-slot') return reinstate(db, paymentId, now);
  return result;
}

/**
 * Pix pago depois de a reserva vencer (ADR 0004): confirma se ainda houver vaga e o número estiver
 * livre. Se não, a inscrição fica vencida com pagamento PAGO, o caso "pago sem vaga" que a
 * secretaria resolve (estorno ou exceção).
 */
async function reinstate(db: PrismaClient, paymentId: string, now: Date): Promise<ApplyResult> {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { registration: { include: { eventCategory: { select: { maxEntries: true } } } } },
  });
  const reg = payment.registration;
  if (reg.status !== 'EXPIRED') return 'paid';
  const max = reg.eventCategory.maxEntries;
  if (max !== null) {
    const taken = await db.registration.count({
      where: {
        eventCategoryId: reg.eventCategoryId,
        OR: [{ status: 'CONFIRMED' }, { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: now } }],
      },
    });
    if (taken >= max) return 'paid-no-slot';
  }
  try {
    const { count } = await db.registration.updateMany({
      where: { id: reg.id, status: 'EXPIRED' },
      data: { status: 'CONFIRMED', confirmedAt: now, holdExpiresAt: null },
    });
    return count === 1 ? 'paid' : 'paid-no-slot';
  } catch (err) {
    // Número de largada (ou o piloto) já tem outra inscrição ativa na categoria.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'paid-no-slot';
    throw err;
  }
}

/** Consulta o pedido no Mercado Pago e aplica. */
export async function syncPayment(deps: PixDeps, paymentId: string): Promise<ApplyResult> {
  const now = deps.now?.() ?? new Date();
  const payment = await deps.db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.provider !== PROVIDER) return 'unchanged'; // dados fictícios do seed
  const mp = requireMercadoPago(deps);
  const token = await getAccessToken(deps.db, mp.config, mp.oauth, now);
  let order: MercadoPagoOrder;
  try {
    order = await mp.orders.getOrder(token, payment.providerChargeId);
  } catch {
    throw mpUnavailable();
  }
  return applyOrder(deps.db, paymentId, order, now);
}

/**
 * Para a tela "Aguardando pagamento": consulta o Mercado Pago só se a última consulta tiver mais de
 * `minIntervalMs` (vários celulares atualizando não viram uma enxurrada de chamadas). Funciona mesmo
 * se o webhook não chegar.
 */
export async function refreshPaymentIfStale(deps: PixDeps, paymentId: string, minIntervalMs = 10_000): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const { count } = await deps.db.payment.updateMany({
    where: {
      id: paymentId,
      status: 'PENDING',
      provider: PROVIDER,
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - minIntervalMs) } }],
    },
    data: { lastCheckedAt: now },
  });
  if (count === 1) await syncPayment(deps, paymentId);
}

export interface WebhookInput {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: unknown;
}
export type WebhookResult = 'processed' | 'ignored' | 'duplicate';

const header = (h: WebhookInput['headers'], name: string) => {
  const v = h[name];
  return Array.isArray(v) ? v[0] : v;
};
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Webhook do Mercado Pago (tópico "order"). Confere a assinatura, guarda o aviso (uma vez só) e
 * aplica o estado lido do Mercado Pago. Pedidos que não são nossos (outras vendas da conta) são
 * ignorados com 200, para o Mercado Pago não ficar reenviando.
 */
export async function handleWebhook(deps: PixDeps, input: WebhookInput): Promise<WebhookResult> {
  const mp = requireMercadoPago(deps);
  const now = deps.now?.() ?? new Date();
  const body = (input.body ?? {}) as { type?: unknown; data?: { id?: unknown } };
  const dataId = text(input.query['data.id']) ?? text(body.data?.id);
  const xRequestId = header(input.headers, 'x-request-id');

  const check = verifyWebhookSignature({
    xSignature: header(input.headers, 'x-signature'),
    xRequestId,
    dataId,
    secret: mp.config.webhookSecret,
    nowMs: now.getTime(),
    toleranceSeconds: WEBHOOK_TOLERANCE_SECONDS,
  });
  if (!check.ok) throw new AppError(401, 'INVALID_SIGNATURE', `Assinatura do aviso inválida (${check.reason}).`);

  const type = text(input.query['type']) ?? text(body.type);
  if (type !== 'order' || !dataId) return 'ignored';

  // Um registro por aviso (x-request-id). Aviso repetido que JÁ foi processado não é processado de
  // novo; se a primeira tentativa falhou no meio, o reenvio processa.
  const providerEventId = xRequestId ?? createHash('sha256').update(JSON.stringify(input.body ?? null)).digest('hex');
  const event = await deps.db.paymentWebhookEvent.upsert({
    where: { provider_providerEventId: { provider: PROVIDER, providerEventId } },
    create: { provider: PROVIDER, providerEventId, payload: (input.body ?? {}) as Prisma.InputJsonValue },
    update: {},
  });
  if (event.processedAt) return 'duplicate';

  const payment = await deps.db.payment.findUnique({
    where: { provider_providerChargeId: { provider: PROVIDER, providerChargeId: dataId } },
  });
  if (payment) await syncPayment(deps, payment.id);
  await deps.db.paymentWebhookEvent.update({ where: { id: event.id }, data: { processedAt: now } });
  return payment ? 'processed' : 'ignored';
}
