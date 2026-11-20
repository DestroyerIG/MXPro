import { EventDashboardDto } from './event-dashboard.model';

/**
 * Dados FICTÍCIOS do escopo (PDF, página 3), usados até a API existir.
 * Horários em UTC: 12:00Z = 09:00 em São Paulo.
 */
export const MOCK_EVENT_DASHBOARD: EventDashboardDto = {
  event: {
    id: 'copa-verao-mx-etapa-2',
    name: 'Copa Verão de Motocross - Etapa 2',
    startsAt: '2027-03-13T11:00:00Z',
    timeZone: 'America/Sao_Paulo',
    venue: 'Pista Terra Vermelha',
    modalities: ['Motocross', 'Cross Country'],
    registrationWindow: 'OPEN',
  },
  registrations: { total: 128, paid: 112 },
  heatCount: 6,
  // Fora de ordem de propósito: o service é quem ordena por horário.
  upcomingHeats: [
    { id: 'h3', startsAt: '2027-03-13T13:20:00Z', categoryName: 'Feminino', label: 'Única', pilotCount: 9, status: 'GRID_PENDING' },
    { id: 'h1', startsAt: '2027-03-13T12:00:00Z', categoryName: 'MX1', label: 'Bateria 1', pilotCount: 24, status: 'READY' },
    { id: 'h2', startsAt: '2027-03-13T12:40:00Z', categoryName: 'MX2', label: 'Bateria 1', pilotCount: 31, status: 'READY' },
    { id: 'h4', startsAt: '2027-03-13T14:00:00Z', categoryName: 'Master 35+', label: 'Bat. 1', pilotCount: 19, status: 'WAITING' },
    { id: 'h5', startsAt: '2027-03-13T14:40:00Z', categoryName: '65cc', label: 'Bateria 1', pilotCount: 17, status: 'WAITING' },
    { id: 'h6', startsAt: '2027-03-13T16:00:00Z', categoryName: 'MX1', label: 'Bateria 2', pilotCount: 24, status: 'WAITING' },
  ],
  registrationsByCategory: [
    { categoryId: 'mx1', categoryName: 'MX1', count: 24 },
    { categoryId: 'mx2', categoryName: 'MX2', count: 31 },
    { categoryId: '65cc', categoryName: '65cc', count: 17 },
    { categoryId: 'fem', categoryName: 'Feminino', count: 9 },
    { categoryId: 'm35', categoryName: 'Master 35+', count: 19 },
    { categoryId: 'cc', categoryName: 'Cross Country', count: 28 },
  ],
};
