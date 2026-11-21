import { describe, expect, it } from 'vitest';
import { orderOutcome } from '../src/payments/pix.service.ts';

/** Tabela de status da API de Orders do Mercado Pago → o que significa para a inscrição (sem banco). */
describe('estado do pedido do Mercado Pago → nosso estado', () => {
  it.each([
    ['processed', 'accredited', 'PAID'],
    ['processed', 'partially_refunded', 'PAID'],
    ['action_required', 'waiting_transfer', 'PENDING'],
    ['created', 'created', 'PENDING'],
    ['canceled', 'expired', 'EXPIRED'],
    ['failed', 'expired', 'EXPIRED'],
    ['canceled', 'canceled', 'CANCELED'],
    ['refunded', 'refunded', 'REFUNDED'],
    ['charged_back', 'settled', 'REFUNDED'],
  ])('%s/%s = %s', (status, detail, outcome) => {
    expect(orderOutcome({ status, status_detail: detail })).toBe(outcome);
  });
});
