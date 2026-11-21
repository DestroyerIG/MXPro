import type { RaceConfig } from '@mxpro/rules-engine';
import { z } from 'zod';

/**
 * Regras da prova de uma categoria do evento (configuração versionada do motor de regras).
 * A configuração em si é validada pelo motor (`raceConfigSchema`); aqui ficam o envelope da API,
 * o motivo e o histórico de versões.
 */

/** Quem e quando salvou uma versão (auditoria). */
export interface RulesVersionDto {
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string } | null;
  /** Motivo (obrigatório nas versões criadas depois da largada). */
  reason: string | null;
}

/** Resposta de GET/PUT /api/events/:id/categories/:eventCategoryId/rules. */
export interface EventCategoryRulesDto {
  eventCategoryId: string;
  /** O motor de regras já cobre a modalidade desta categoria (hoje: só Motocross). */
  supported: boolean;
  /** Configuração em vigor; sem versão salva, é o modelo pronto da modalidade. null se não suportada. */
  config: RaceConfig | null;
  /** false = ainda é o modelo pronto (nada foi salvo para esta categoria). */
  saved: boolean;
  /** Alguma bateria da categoria já começou: mudar exige motivo e cria nova versão. */
  frozen: boolean;
  /** Versão em vigor (null se nada foi salvo). */
  current: RulesVersionDto | null;
  /** Todas as versões, da mais nova para a mais antiga. */
  history: RulesVersionDto[];
}

/** Corpo do PUT. `config` é validada pelo motor de regras na API. */
export const saveRulesSchema = z.object({
  config: z.unknown(),
  reason: z
    .string()
    .trim()
    .max(500, 'Use no máximo 500 caracteres.')
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type SaveRulesRequest = { config: RaceConfig; reason?: string };
