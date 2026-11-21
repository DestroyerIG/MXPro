import { z } from 'zod';
import './zod-pt.ts';

/**
 * Configuração da API, lida das variáveis de ambiente e VALIDADA na subida (Zod).
 * Variável faltando ou inválida = a API não sobe, com mensagem dizendo o que corrigir.
 * Segredos só por ambiente, nunca no código (docs/arquitetura.md §5.7).
 */
const DEV_ORIGIN = 'http://localhost:4200';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z.string().startsWith('postgresql://', 'deve começar com postgresql://'),
    /** Origens do front autorizadas a chamar a API (CORS), separadas por vírgula. */
    CORS_ORIGINS: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',').map((o) => o.trim()).filter(Boolean) : undefined))
      .pipe(z.array(z.url('cada origem deve ser uma URL, ex.: https://meudominio.com.br')).optional()),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /** Duração da sessão sem uso. Renova sozinha enquanto o usuário usa o sistema. */
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
    // ─── Mercado Pago (ADR 0005). Credenciais do APLICATIVO em "Suas integrações"; a conta que
    // recebe é a do contratante, conectada pela tela Financeiro (OAuth). Opcionais em desenvolvimento.
    MP_CLIENT_ID: z.string().trim().min(1).optional(),
    MP_CLIENT_SECRET: z.string().trim().min(1).optional(),
    /** URL de retorno cadastrada no aplicativo; precisa ser IGUAL à cadastrada (ex.: https://dominio/api/payments/mercadopago/callback). */
    MP_REDIRECT_URI: z.url('deve ser uma URL, ex.: https://meudominio.com.br/api/payments/mercadopago/callback').optional(),
    /** "true" = credenciais de teste (sandbox) na troca do código. */
    MP_TEST_MODE: z.enum(['true', 'false']).default('false'),
    /** Chave de 32 bytes em base64 que criptografa os tokens no banco. Gere com: openssl rand -base64 32 */
    PAYMENT_TOKEN_KEY: z
      .string()
      .optional()
      .refine((v) => v === undefined || Buffer.from(v, 'base64').length === 32, 'deve ter 32 bytes em base64 (openssl rand -base64 32)'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.CORS_ORIGINS?.length) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'obrigatório em produção' });
    }
    // Mercado Pago: tudo ou nada (metade configurada é erro de digitação, não "desligado").
    const mp = ['MP_CLIENT_ID', 'MP_CLIENT_SECRET', 'MP_REDIRECT_URI', 'PAYMENT_TOKEN_KEY'] as const;
    const set = mp.filter((k) => env[k] !== undefined);
    if (set.length > 0 && set.length < mp.length) {
      for (const k of mp.filter((k) => env[k] === undefined)) {
        ctx.addIssue({ code: 'custom', path: [k], message: 'obrigatório junto com as demais variáveis do Mercado Pago' });
      }
    }
  });

/** Integração com o Mercado Pago; null = não configurada (a tela Financeiro explica o que falta). */
export interface MercadoPagoConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  testMode: boolean;
  /** Chave AES-256 dos tokens guardados no banco. */
  tokenKey: Buffer;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  sessionTtlMs: number;
  /** Cookie só por HTTPS (produção). Em desenvolvimento o front roda em http://localhost. */
  cookieSecure: boolean;
  mercadoPago: MercadoPagoConfig | null;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida da API:\n${problems}\nVeja o .env.example.`);
  }
  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    corsOrigins: e.CORS_ORIGINS ?? [DEV_ORIGIN],
    logLevel: e.LOG_LEVEL,
    sessionTtlMs: e.SESSION_TTL_HOURS * 3_600_000,
    cookieSecure: e.NODE_ENV === 'production',
    mercadoPago:
      e.MP_CLIENT_ID && e.MP_CLIENT_SECRET && e.MP_REDIRECT_URI && e.PAYMENT_TOKEN_KEY
        ? {
            clientId: e.MP_CLIENT_ID,
            clientSecret: e.MP_CLIENT_SECRET,
            redirectUri: e.MP_REDIRECT_URI,
            testMode: e.MP_TEST_MODE === 'true',
            tokenKey: Buffer.from(e.PAYMENT_TOKEN_KEY, 'base64'),
          }
        : null,
  };
}
