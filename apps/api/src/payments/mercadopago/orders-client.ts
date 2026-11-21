import { z } from 'zod';

/**
 * API de Orders do Mercado Pago, usada para o Pix (recomendada pela documentação para integrações
 * novas; referência: /developers/pt/reference/online-payments/checkout-api/create-order/post).
 * Sempre chamada com o access token do VENDEDOR (a conta do contratante conectada por OAuth).
 * Fica atrás de uma interface: os testes usam uma versão simulada, sem rede.
 */

export const MP_ORDERS_URL = 'https://api.mercadopago.com/v1/orders';

/** Só os campos que usamos; o resto da resposta é ignorado (`z.object` descarta extras). */
const orderSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  status_detail: z.string().optional(),
  external_reference: z.string().optional(),
  total_amount: z.string().optional(),
  total_paid_amount: z.string().optional(),
  transactions: z
    .object({
      payments: z
        .array(
          z.object({
            id: z.string().optional(),
            status: z.string().optional(),
            payment_method: z
              .object({
                qr_code: z.string().optional(),
                qr_code_base64: z.string().optional(),
                ticket_url: z.string().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
export type MercadoPagoOrder = z.output<typeof orderSchema>;

export interface CreatePixOrderInput {
  /** Chave de idempotência: repetir a chamada com a mesma chave não cria outro Pix. */
  idempotencyKey: string;
  /** Nosso id da inscrição (aparece no painel do Mercado Pago e volta nas consultas). */
  externalReference: string;
  amountCents: number;
  description: string;
  payerEmail: string;
  /** Validade do Pix em minutos (mínimo do Mercado Pago: 30). */
  expiresInMinutes: number;
}

export interface MercadoPagoOrders {
  createPixOrder(accessToken: string, input: CreatePixOrderInput): Promise<MercadoPagoOrder>;
  getOrder(accessToken: string, orderId: string): Promise<MercadoPagoOrder>;
  cancelOrder(accessToken: string, orderId: string, idempotencyKey: string): Promise<MercadoPagoOrder>;
}

/** Falha numa chamada à API de Orders (o corpo da resposta fica só no log). */
export class MercadoPagoApiError extends Error {
  constructor(
    readonly status: number,
    readonly providerCode: string | undefined,
  ) {
    super(`Mercado Pago respondeu HTTP ${status}${providerCode ? ` (${providerCode})` : ''}.`);
    this.name = 'MercadoPagoApiError';
  }
}

/** Centavos inteiros → "150.00" (a API de Orders recebe valores como texto com ponto). */
export function centsToAmount(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Valor inválido: ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** "150.00" (ou "150", "150.5") → centavos inteiros, sem passar por float. */
export function amountToCents(amount: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null;
}

export function createMercadoPagoOrders(fetchImpl: typeof fetch = fetch): MercadoPagoOrders {
  async function call(accessToken: string, url: string, init: { method: string; body?: unknown; idempotencyKey?: string }) {
    const res = await fetchImpl(url, {
      method: init.method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(init.idempotencyKey ? { 'x-idempotency-key': init.idempotencyKey } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(15_000),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const errors = (json as { errors?: { code?: unknown }[] } | null)?.errors;
      const code = errors?.[0]?.code;
      throw new MercadoPagoApiError(res.status, typeof code === 'string' ? code : undefined);
    }
    return orderSchema.parse(json);
  }

  return {
    createPixOrder: (token, input) => {
      const amount = centsToAmount(input.amountCents);
      return call(token, MP_ORDERS_URL, {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        body: {
          type: 'online',
          processing_mode: 'automatic',
          external_reference: input.externalReference,
          description: input.description,
          total_amount: amount,
          payer: { email: input.payerEmail },
          transactions: {
            payments: [
              {
                amount,
                payment_method: { id: 'pix', type: 'bank_transfer' },
                // Duração ISO 8601: "PT30M" = 30 minutos.
                expiration_time: `PT${input.expiresInMinutes}M`,
              },
            ],
          },
        },
      });
    },
    getOrder: (token, orderId) => call(token, `${MP_ORDERS_URL}/${encodeURIComponent(orderId)}`, { method: 'GET' }),
    cancelOrder: (token, orderId, idempotencyKey) =>
      call(token, `${MP_ORDERS_URL}/${encodeURIComponent(orderId)}/cancel`, { method: 'POST', idempotencyKey }),
  };
}
