import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@mxpro/db';
import type { MercadoPagoConnectResult, MercadoPagoConnectionDto } from '@mxpro/shared';
import type { MercadoPagoConfig } from '../../config.ts';
import { AppError } from '../../errors.ts';
import { decryptToken, encryptToken } from '../token-cipher.ts';
import { type MercadoPagoOAuth, type MercadoPagoTokens, authorizationUrl } from './oauth-client.ts';

/**
 * Conexão da conta do Mercado Pago do contratante (OAuth "authorization code" com PKCE, ADR 0005).
 *
 * 1. O organizador clica em "Conectar": geramos `state` (anti-CSRF) e `code_verifier` (PKCE),
 *    guardamos o hash do state e devolvemos a URL de autorização do Mercado Pago.
 * 2. O Mercado Pago devolve o navegador para a nossa URL de retorno com `code` e `state`.
 * 3. Conferimos o state (existe, é de quem iniciou, não venceu, uso único), trocamos o código pelos
 *    tokens e os guardamos CRIPTOGRAFADOS.
 */

const ACCOUNT_ID = 1;
const STATE_TTL_MS = 10 * 60_000; // o código de autorização do Mercado Pago também vale 10 minutos
/** Renova o acesso quando faltar menos que isto (o token vale 180 dias). */
export const REFRESH_BEFORE_MS = 30 * 24 * 3_600_000;
/** Número fixo para o lock do Postgres que impede duas renovações ao mesmo tempo. */
const REFRESH_LOCK_KEY = 4_301_001;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function notConfigured(): AppError {
  return new AppError(
    409,
    'MP_NOT_CONFIGURED',
    'A integração com o Mercado Pago ainda não foi configurada no servidor (credenciais do aplicativo).',
  );
}

export async function getConnection(db: PrismaClient, config: MercadoPagoConfig | null): Promise<MercadoPagoConnectionDto> {
  const account = await db.mercadoPagoAccount.findUnique({
    where: { id: ACCOUNT_ID },
    include: { connectedBy: { select: { id: true, name: true } } },
  });
  return {
    configured: config !== null,
    account: account && {
      mpUserId: account.mpUserId,
      liveMode: account.liveMode,
      connectedAt: account.connectedAt.toISOString(),
      connectedBy: account.connectedBy,
      expiresAt: account.expiresAt.toISOString(),
    },
  };
}

/** Passo 1: devolve a URL de autorização do Mercado Pago. */
export async function startConnection(db: PrismaClient, config: MercadoPagoConfig | null, userId: string, now = new Date()): Promise<string> {
  if (!config) throw notConfigured();
  const state = randomBytes(32).toString('base64url');
  // PKCE: verificador de 43 caracteres (32 bytes em base64url); o desafio é o SHA-256 dele.
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  await db.oAuthState.deleteMany({ where: { expiresAt: { lt: now } } }); // faxina das tentativas abandonadas
  await db.oAuthState.create({
    data: { id: sha256(state), userId, codeVerifier, createdAt: now, expiresAt: new Date(now.getTime() + STATE_TTL_MS) },
  });
  return authorizationUrl(config, state, codeChallenge);
}

function toAccountData(config: MercadoPagoConfig, tokens: MercadoPagoTokens, now: Date) {
  return {
    mpUserId: tokens.user_id,
    accessTokenEncrypted: encryptToken(tokens.access_token, config.tokenKey),
    refreshTokenEncrypted: encryptToken(tokens.refresh_token, config.tokenKey),
    publicKey: tokens.public_key ?? null,
    scope: tokens.scope ?? null,
    liveMode: tokens.live_mode ?? !config.testMode,
    expiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
  };
}

/**
 * Passo 3: retorno do Mercado Pago. Devolve o resultado para a tela (nunca lança para o navegador:
 * quem chega aqui é uma navegação, não uma chamada da tela).
 */
export async function finishConnection(
  db: PrismaClient,
  config: MercadoPagoConfig | null,
  oauth: MercadoPagoOAuth | null,
  input: { code?: string; state?: string; error?: string },
  userId: string,
  now = new Date(),
): Promise<MercadoPagoConnectResult> {
  if (!config || !oauth) return 'nao-configurado';
  if (!input.state) return 'expirado';
  // Uso único: apagar e conferir no mesmo comando (dois retornos com o mesmo state não passam).
  const stateId = sha256(input.state);
  const pending = await db.oAuthState.findUnique({ where: { id: stateId } });
  const { count } = await db.oAuthState.deleteMany({ where: { id: stateId, userId, expiresAt: { gt: now } } });
  if (count === 0 || !pending) return 'expirado';
  if (input.error || !input.code) return 'negado'; // o organizador clicou em "cancelar" no Mercado Pago

  let tokens: MercadoPagoTokens;
  try {
    tokens = await oauth.exchangeCode(input.code, pending.codeVerifier);
  } catch {
    return 'falha';
  }
  const data = toAccountData(config, tokens, now);
  await db.mercadoPagoAccount.upsert({
    where: { id: ACCOUNT_ID },
    create: { id: ACCOUNT_ID, ...data, connectedById: userId, connectedAt: now },
    update: { ...data, connectedById: userId, connectedAt: now, refreshedAt: null },
  });
  return 'conectado';
}

/** Desconecta: apaga os tokens daqui. (A autorização também pode ser revogada no próprio Mercado Pago.) */
export async function disconnect(db: PrismaClient): Promise<void> {
  await db.mercadoPagoAccount.deleteMany({ where: { id: ACCOUNT_ID } });
}

/**
 * Access token válido para cobrar em nome do contratante (usado pelas cobranças Pix).
 * Perto de vencer, renova com o refresh token, sob lock: o refresh token muda a cada renovação,
 * e duas renovações simultâneas fariam uma delas usar um token já trocado.
 */
export async function getAccessToken(
  db: PrismaClient,
  config: MercadoPagoConfig | null,
  oauth: MercadoPagoOAuth | null,
  now = new Date(),
): Promise<string> {
  if (!config || !oauth) throw notConfigured();
  const notConnected = () =>
    new AppError(409, 'MP_NOT_CONNECTED', 'Nenhuma conta do Mercado Pago está conectada para receber as inscrições.');
  const fresh = (a: { expiresAt: Date }) => a.expiresAt.getTime() - now.getTime() > REFRESH_BEFORE_MS;

  const account = await db.mercadoPagoAccount.findUnique({ where: { id: ACCOUNT_ID } });
  if (!account) throw notConnected();
  if (fresh(account)) return decryptToken(account.accessTokenEncrypted, config.tokenKey);

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFRESH_LOCK_KEY})`;
      const current = await tx.mercadoPagoAccount.findUnique({ where: { id: ACCOUNT_ID } });
      if (!current) throw notConnected();
      if (fresh(current)) return decryptToken(current.accessTokenEncrypted, config.tokenKey); // outro pedido já renovou
      let tokens: MercadoPagoTokens;
      try {
        tokens = await oauth.refresh(decryptToken(current.refreshTokenEncrypted, config.tokenKey));
      } catch {
        // Renovar falhou: se o token atual ainda vale, segue com ele; se venceu, é preciso reconectar.
        if (current.expiresAt > now) return decryptToken(current.accessTokenEncrypted, config.tokenKey);
        throw new AppError(409, 'MP_RECONNECT_REQUIRED', 'O acesso ao Mercado Pago venceu. O organizador precisa conectar a conta de novo.');
      }
      await tx.mercadoPagoAccount.update({
        where: { id: ACCOUNT_ID },
        data: { ...toAccountData(config, tokens, now), refreshedAt: now },
      });
      return tokens.access_token;
    },
    { timeout: 30_000 },
  );
}
