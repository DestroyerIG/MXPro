import { describe, expect, it } from 'vitest';
import { hmac, manifest, verifyWebhookSignature } from '../src/payments/mercadopago/webhook-signature.ts';

const SECRET = 'segredo-do-webhook';
const TS = '1704908010';
const NOW = Number(TS) * 1000;

function check(overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) {
  const base = { xRequestId: 'req-123', dataId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3', secret: SECRET, nowMs: NOW, toleranceSeconds: 300 };
  const signed = `ts=${TS},v1=${hmac(manifest(base.dataId, base.xRequestId, TS), SECRET)}`;
  return verifyWebhookSignature({ ...base, xSignature: signed, ...overrides });
}

describe('assinatura do webhook do Mercado Pago', () => {
  it('manifesto como no SDK oficial: id, request-id e ts, cada um com ";" no fim', () => {
    expect(manifest('123', 'abc', TS)).toBe(`id:123;request-id:abc;ts:${TS};`);
    expect(manifest(undefined, 'abc', TS)).toBe(`request-id:abc;ts:${TS};`);
    expect(manifest('123', undefined, TS)).toBe(`id:123;ts:${TS};`);
  });

  it('assinatura certa passa (com espaços no cabeçalho e hash em maiúsculas também)', () => {
    expect(check()).toEqual({ ok: true });
    const h = hmac(manifest('ORD01JQ4S4KY8HWQ6NA5PXB65B3D3', 'req-123', TS), SECRET).toUpperCase();
    expect(check({ xSignature: ` ts = ${TS} , v1 = ${h} ` })).toEqual({ ok: true });
  });

  it('aceita o data.id em minúsculas (regra da documentação antiga)', () => {
    const lower = hmac(manifest('ord01jq4s4ky8hwq6na5pxb65b3d3', 'req-123', TS), SECRET);
    expect(check({ xSignature: `ts=${TS},v1=${lower}` })).toEqual({ ok: true });
  });

  it('segredo errado, id trocado ou request-id trocado: recusa', () => {
    expect(check({ secret: 'outro' })).toEqual({ ok: false, reason: 'mismatch' });
    expect(check({ dataId: 'ORD-OUTRO' })).toEqual({ ok: false, reason: 'mismatch' });
    expect(check({ xRequestId: 'req-999' })).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('cabeçalho ausente ou mal formado', () => {
    expect(check({ xSignature: undefined })).toEqual({ ok: false, reason: 'missing' });
    expect(check({ xSignature: 'lixo' })).toEqual({ ok: false, reason: 'malformed' });
    expect(check({ xSignature: `ts=abc,v1=00` })).toEqual({ ok: false, reason: 'malformed' });
    expect(check({ xSignature: `ts=${TS}` })).toEqual({ ok: false, reason: 'malformed' });
  });

  it('aviso antigo (fora da tolerância) é recusado mesmo com assinatura certa', () => {
    expect(check({ nowMs: NOW + 301_000 })).toEqual({ ok: false, reason: 'too-old' });
    expect(check({ nowMs: NOW + 299_000 })).toEqual({ ok: true });
  });
});
