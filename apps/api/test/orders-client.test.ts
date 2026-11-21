import { describe, expect, it, vi } from 'vitest';
import { MercadoPagoApiError, amountToCents, centsToAmount, createMercadoPagoOrders } from '../src/payments/mercadopago/orders-client.ts';

/** Formato das chamadas à API de Orders (fetch simulado: nada sai para a rede). */

const ORDER = {
  id: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3',
  status: 'action_required',
  status_detail: 'waiting_transfer',
  total_amount: '150.00',
  transactions: { payments: [{ id: 'PAY01', payment_method: { id: 'pix', qr_code: '00020126580014br.gov.bcb.pix', ticket_url: 'https://x' } }] },
  campo_que_nao_usamos: true,
};

function fakeFetch(status = 201, body: unknown = ORDER) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })));
}

describe('valores em texto da API de Orders', () => {
  it('centavos ↔ "150.00" sem float', () => {
    expect(centsToAmount(15000)).toBe('150.00');
    expect(centsToAmount(8005)).toBe('80.05');
    expect(centsToAmount(0)).toBe('0.00');
    expect(amountToCents('150.00')).toBe(15000);
    expect(amountToCents('150.5')).toBe(15050);
    expect(amountToCents('150')).toBe(15000);
    expect(amountToCents('abc')).toBeNull();
    expect(() => centsToAmount(1.5)).toThrow();
  });
});

describe('cliente de Orders', () => {
  it('cria o Pix: POST /v1/orders com token do vendedor, chave de idempotência e corpo da documentação', async () => {
    const fetchImpl = fakeFetch();
    const order = await createMercadoPagoOrders(fetchImpl).createPixOrder('APP_USR-vendedor', {
      idempotencyKey: 'chave-1',
      externalReference: 'reg-1',
      amountCents: 15000,
      description: 'Inscrição MX2',
      payerEmail: 'piloto@mxpro.test',
      expiresInMinutes: 30,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.mercadopago.com/v1/orders');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer APP_USR-vendedor', 'x-idempotency-key': 'chave-1' });
    expect(JSON.parse(String(init?.body))).toEqual({
      type: 'online',
      processing_mode: 'automatic',
      external_reference: 'reg-1',
      description: 'Inscrição MX2',
      total_amount: '150.00',
      payer: { email: 'piloto@mxpro.test' },
      transactions: { payments: [{ amount: '150.00', payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT30M' }] },
    });
    expect(order.transactions?.payments?.[0]?.payment_method?.qr_code).toBe('00020126580014br.gov.bcb.pix');
    expect(order).not.toHaveProperty('campo_que_nao_usamos');
  });

  it('consulta e cancela pelo id do pedido', async () => {
    const fetchImpl = fakeFetch(200);
    const orders = createMercadoPagoOrders(fetchImpl);
    await orders.getOrder('tok', 'ORD/1');
    await orders.cancelOrder('tok', 'ORD1', 'chave-2');
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.mercadopago.com/v1/orders/ORD%2F1');
    expect(fetchImpl.mock.calls[0]![1]?.method).toBe('GET');
    expect(fetchImpl.mock.calls[1]![0]).toBe('https://api.mercadopago.com/v1/orders/ORD1/cancel');
    expect(fetchImpl.mock.calls[1]![1]?.headers).toMatchObject({ 'x-idempotency-key': 'chave-2' });
  });

  it('erro do Mercado Pago vira MercadoPagoApiError com o código do provedor', async () => {
    const orders = createMercadoPagoOrders(fakeFetch(409, { errors: [{ code: 'cannot_cancel_order', message: '…' }] }));
    await expect(orders.cancelOrder('tok', 'ORD1', 'k')).rejects.toEqual(new MercadoPagoApiError(409, 'cannot_cancel_order'));
  });
});
