import { z } from 'zod';
import type { MercadoPagoConfig } from '../../config.ts';

/**
 * Chamadas OAuth ao Mercado Pago (docs oficiais: /developers/pt/docs/security/oauth e a referência
 * POST /oauth/token). Fica atrás de uma interface: os testes usam uma implementação falsa, sem rede.
 */

export const MP_AUTHORIZATION_URL = 'https://auth.mercadopago.com/authorization';
export const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

/** Resposta de POST /oauth/token (campos conforme a referência da API). */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  /** Segundos; padrão do Mercado Pago: 180 dias (15552000). */
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
  user_id: z.union([z.number(), z.string()]).transform(String),
  refresh_token: z.string().min(1),
  public_key: z.string().optional(),
  live_mode: z.boolean().optional(),
});
export type MercadoPagoTokens = z.output<typeof tokenResponseSchema>;

export interface MercadoPagoOAuth {
  /** Troca o código recebido no retorno da autorização pelos tokens do vendedor (com PKCE). */
  exchangeCode(code: string, codeVerifier: string): Promise<MercadoPagoTokens>;
  /** Renova o access token. O refresh token também muda a cada renovação: guardar o novo. */
  refresh(refreshToken: string): Promise<MercadoPagoTokens>;
}

/** Falha do Mercado Pago na troca de tokens (a mensagem do provedor fica só no log). */
export class MercadoPagoOAuthError extends Error {
  constructor(
    readonly status: number,
    readonly providerCode: string | undefined,
  ) {
    super(`Mercado Pago recusou a troca de tokens (HTTP ${status}${providerCode ? `, ${providerCode}` : ''}).`);
    this.name = 'MercadoPagoOAuthError';
  }
}

/** Monta a URL de autorização (o organizador é levado até ela para autorizar a conta). */
export function authorizationUrl(config: MercadoPagoConfig, state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: config.redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${MP_AUTHORIZATION_URL}?${params.toString()}`;
}

export function createMercadoPagoOAuth(config: MercadoPagoConfig, fetchImpl: typeof fetch = fetch): MercadoPagoOAuth {
  async function token(body: Record<string, string>): Promise<MercadoPagoTokens> {
    const res = await fetchImpl(MP_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, ...body }),
      signal: AbortSignal.timeout(15_000),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (json as { error?: unknown } | null)?.error;
      throw new MercadoPagoOAuthError(res.status, typeof code === 'string' ? code : undefined);
    }
    return tokenResponseSchema.parse(json);
  }

  return {
    exchangeCode: (code, codeVerifier) =>
      token({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: config.redirectUri,
        test_token: String(config.testMode),
      }),
    refresh: (refreshToken) => token({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  };
}
