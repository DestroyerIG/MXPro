import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Validação da assinatura dos webhooks do Mercado Pago (cabeçalho `x-signature`).
 *
 * Mesma regra do validador oficial do SDK (mercadopago/sdk-nodejs, src/utils/webhook):
 * - cabeçalho no formato `ts=<segundos>,v1=<hash hex>`;
 * - manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, omitindo as partes ausentes;
 * - HMAC-SHA256 do manifesto com a assinatura secreta do aplicativo, em hexadecimal;
 * - comparação em tempo constante (não revela, pelo tempo de resposta, quantos caracteres batem);
 * - tolerância de tempo contra reenvio de um aviso antigo capturado.
 *
 * A documentação antiga pedia `data.id` em minúsculas quando alfanumérico; o SDK atual usa o valor
 * como veio. Aceitamos os dois: ambos exigem conhecer o segredo, então não enfraquece a checagem.
 */

export type SignatureCheck = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'mismatch' | 'too-old' };

export function verifyWebhookSignature(input: {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
  secret: string;
  nowMs: number;
  toleranceSeconds: number;
}): SignatureCheck {
  const header = input.xSignature?.trim();
  if (!header) return { ok: false, reason: 'missing' };

  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') ts = value;
    else if (key === 'v1') v1 = value;
  }
  if (!ts || !/^\d+$/.test(ts) || !v1) return { ok: false, reason: 'malformed' };

  const requestId = input.xRequestId?.trim() || undefined;
  const dataId = input.dataId?.trim() || undefined;
  const candidates = dataId && dataId !== dataId.toLowerCase() ? [dataId, dataId.toLowerCase()] : [dataId];
  const matches = candidates.some((id) => equalHex(hmac(manifest(id, requestId, ts), input.secret), v1));
  if (!matches) return { ok: false, reason: 'mismatch' };

  if (Math.abs(input.nowMs - Number(ts) * 1000) / 1000 > input.toleranceSeconds) return { ok: false, reason: 'too-old' };
  return { ok: true };
}

/** Exportado para os testes montarem avisos assinados. */
export function manifest(dataId: string | undefined, requestId: string | undefined, ts: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return `${parts.join(';')};`;
}

export function hmac(text: string, secret: string): string {
  return createHmac('sha256', secret).update(text).digest('hex');
}

function equalHex(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}
