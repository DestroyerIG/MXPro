import type { DashboardHeatDto, EventDashboardDto, EventDto } from '@mxpro/shared';

export type { DashboardHeatDto, EventDashboardDto };

/** O que a tela recebe: os dados da API já com os valores derivados calculados (função pura). */
export interface EventDashboard {
  event: EventDto;
  /** Rótulos das modalidades ("Motocross", "Cross Country"). */
  modalities: string[];
  totals: { registered: number; paid: number; pending: number; heats: number };
  upcomingHeats: DashboardHeatDto[];
  registrationsByCategory: EventDashboardDto['registrationsByCategory'];
}
