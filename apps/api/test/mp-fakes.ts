import type { PrismaClient } from '@mxpro/db';
import { vi } from 'vitest';
import type { MercadoPagoOAuth } from '../src/payments/mercadopago/oauth-client.ts';
import type { CreatePixOrderInput, MercadoPagoOrder, MercadoPagoOrders } from '../src/payments/mercadopago/orders-client.ts';
import { encryptToken } from '../src/payments/token-cipher.ts';

/** Mercado Pago SIMULADO para os testes de integração (nada sai para a rede). */

export const MP_KEY = Buffer.alloc(32, 9);
export const MP_WEBHOOK_SECRET = 'segredo-do-webhook';
export const MP_ENV = {
  MP_CLIENT_ID: '1234567890',
  MP_CLIENT_SECRET: 'segredo-do-app',
  MP_REDIRECT_URI: 'https://mxpro.test/api/payments/mercadopago/callback',
  MP_WEBHOOK_SECRET,
  PAYMENT_TOKEN_KEY: MP_KEY.toString('base64'),
};
export const SELLER_TOKEN = 'APP_USR-token-do-vendedor';

export const fakeOAuth = (): MercadoPagoOAuth => ({ exchangeCode: vi.fn(), refresh: vi.fn() });

/** API de Orders em memória: o teste muda o estado dos pedidos como o banco do pagador faria. */
export function fakeOrders() {
  const orders = new Map<string, MercadoPagoOrder>();
  const created: { token: string; input: CreatePixOrderInput }[] = [];
  let next = 1;
  const api = {
    createPixOrder: vi.fn<MercadoPagoOrders['createPixOrder']>((token, input) => {
      created.push({ token, input });
      const amount = `${input.amountCents / 100}.00`;
      const n = next++;
      const order: MercadoPagoOrder = {
        id: `ORD0000${n}`,
        status: 'action_required',
        status_detail: 'waiting_transfer',
        external_reference: input.externalReference,
        total_amount: amount,
        transactions: { payments: [{ id: `PAY0${n}`, payment_method: { qr_code: `00020101PIX-${n}` } }] },
      };
      orders.set(order.id, order);
      return Promise.resolve(order);
    }),
    getOrder: vi.fn<MercadoPagoOrders['getOrder']>((_token, id) => Promise.resolve(structuredClone(orders.get(id)!))),
    cancelOrder: vi.fn<MercadoPagoOrders['cancelOrder']>(),
  };
  /** O pagador pagou / o Pix venceu / houve estorno. */
  const set = (id: string, status: string, detail: string, paid?: string) => {
    const o = orders.get(id)!;
    orders.set(id, { ...o, status, status_detail: detail, total_paid_amount: paid ?? o.total_amount });
  };
  const last = () => [...orders.keys()].at(-1)!;
  return { api, created, set, orders, last };
}

/** Conta do contratante já conectada (passo 6.2). */
export function connectSellerAccount(db: PrismaClient) {
  return db.mercadoPagoAccount.create({
    data: {
      id: 1,
      mpUserId: '241983636',
      accessTokenEncrypted: encryptToken(SELLER_TOKEN, MP_KEY),
      refreshTokenEncrypted: encryptToken('TG-refresh', MP_KEY),
      liveMode: false,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    },
  });
}
