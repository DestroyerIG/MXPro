import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Criptografia dos tokens do Mercado Pago guardados no banco (AES-256-GCM).
 *
 * GCM criptografa E autentica: um texto adulterado ou uma chave errada fazem a leitura FALHAR
 * (em vez de devolver lixo). Cada gravação usa um IV aleatório novo.
 * Formato guardado: "v1.<iv>.<tag>.<texto cifrado>" (base64url). O "v1" permite trocar o
 * algoritmo no futuro sem perder os tokens já gravados.
 */
const VERSION = 'v1';
const IV_BYTES = 12; // tamanho recomendado para GCM

export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptToken(stored: string, key: Buffer): string {
  const [version, iv, tag, data] = stored.split('.');
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error('Token guardado em formato desconhecido.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
