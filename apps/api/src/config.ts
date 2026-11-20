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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.CORS_ORIGINS?.length) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'obrigatório em produção' });
    }
  });

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
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
  };
}
