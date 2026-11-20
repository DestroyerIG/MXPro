/**
 * Formato dos dados do painel do evento.
 * Quando existir a API, estes tipos migram para `packages/shared` (schemas Zod compartilhados com o backend).
 */

export type RegistrationWindow = 'OPEN' | 'CLOSED';
export type HeatStatus = 'READY' | 'GRID_PENDING' | 'WAITING';

/** O que a API devolverá: dados crus. Datas em ISO UTC. */
export interface EventDashboardDto {
  event: {
    id: string;
    name: string;
    startsAt: string;
    /** Fuso IANA do evento, ex.: "America/Sao_Paulo". */
    timeZone: string;
    venue: string;
    modalities: string[];
    registrationWindow: RegistrationWindow;
  };
  registrations: { total: number; paid: number };
  heatCount: number;
  upcomingHeats: {
    id: string;
    startsAt: string;
    categoryName: string;
    label: string;
    pilotCount: number;
    status: HeatStatus;
  }[];
  registrationsByCategory: { categoryId: string; categoryName: string; count: number }[];
}

/** O que a tela recebe: já com os valores derivados calculados no service. */
export interface EventDashboard {
  event: EventDashboardDto['event'];
  totals: { registered: number; paid: number; pending: number; heats: number };
  upcomingHeats: EventDashboardDto['upcomingHeats'];
  registrationsByCategory: EventDashboardDto['registrationsByCategory'];
}
