import { createHash, randomBytes } from 'node:crypto';

/**
 * Token de sessão: 32 bytes aleatórios (256 bits), em base64url, enviado SÓ no cookie httpOnly.
 * No banco guardamos apenas o SHA-256 dele: um vazamento do banco não permite usar as sessões.
 * (SHA-256 sem "sal" é suficiente aqui porque o token já é aleatório e longo, diferente de senha.)
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** `__Host-` exige HTTPS, Path=/ e nenhum Domain: o navegador impede que subdomínios o sobrescrevam. */
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-mxpro_session' : 'mxpro_session';
}
