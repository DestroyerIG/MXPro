/**
 * Painel do evento (docs/arquitetura.md §4.1) — só tipos, sem Zod (o front importa daqui).
 */
import type { EventDto, Modality } from './events-defaults.js';

/**
 * Situação de uma bateria no painel: pronta (grid montado), grid pendente ou aguardando.
 * Enquanto não existem inscrições e grid (fase de inscrições), toda bateria programada é "WAITING".
 */
export const DASHBOARD_HEAT_STATUSES = ['READY', 'GRID_PENDING', 'WAITING'] as const;
export type DashboardHeatStatus = (typeof DASHBOARD_HEAT_STATUSES)[number];

export interface DashboardHeatDto {
  id: string;
  name: string;
  /** ISO 8601 (UTC) ou null (horário a definir). */
  scheduledAt: string | null;
  categoryNames: string[];
  pilotCount: number;
  status: DashboardHeatStatus;
}

/** Resposta de GET /api/events/:id/dashboard. */
export interface EventDashboardDto {
  event: EventDto;
  /** Modalidades das categorias do evento, sem repetir (ex.: Motocross + Cross Country). */
  modalities: Modality[];
  registrations: { total: number; paid: number };
  heatCount: number;
  /** Baterias ainda não encerradas, na ordem da programação ("a definir" no fim). */
  upcomingHeats: DashboardHeatDto[];
  registrationsByCategory: { eventCategoryId: string; categoryName: string; count: number }[];
}
