import type { EventDashboardDto } from '@mxpro/shared';
import { eventDto } from '../events/events.testing';

/** Painel fictício da Etapa 2 (mesmos dados do seed), para os testes. */
export function dashboardDto(patch: Partial<EventDashboardDto> = {}): EventDashboardDto {
  return {
    event: eventDto(),
    modalities: ['MOTOCROSS', 'CROSS_COUNTRY'],
    registrations: { total: 0, paid: 0 },
    heatCount: 6,
    upcomingHeats: [
      { id: 'h1', name: 'Bateria 1', scheduledAt: '2027-03-13T12:00:00.000Z', categoryNames: ['MX1'], pilotCount: 0, status: 'WAITING' },
      { id: 'h2', name: 'Bateria 1', scheduledAt: '2027-03-13T12:40:00.000Z', categoryNames: ['Master 35+', 'MX2'], pilotCount: 0, status: 'WAITING' },
      { id: 'h3', name: 'Final', scheduledAt: null, categoryNames: ['MX1'], pilotCount: 1, status: 'READY' },
    ],
    registrationsByCategory: [
      { eventCategoryId: 'ec-mx1', categoryName: 'MX1', count: 0 },
      { eventCategoryId: 'ec-mx2', categoryName: 'MX2', count: 0 },
    ],
    ...patch,
  };
}
