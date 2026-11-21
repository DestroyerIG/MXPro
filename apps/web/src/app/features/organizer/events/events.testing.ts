import type { ChampionshipDto, EventDto } from '@mxpro/shared';

/** Eventos fictícios para os testes das telas de eventos (mesmos dados do seed). */
export function eventDto(patch: Partial<EventDto> = {}): EventDto {
  return {
    id: '019a8f00-0000-7000-8000-000000000102',
    name: 'Copa Verão de Motocross - Etapa 2',
    championship: { id: '019a8f00-0000-7000-8000-000000000001', name: 'Copa Verão de Motocross', season: 2027 },
    stageNumber: 2,
    startDate: '2027-03-13',
    endDate: '2027-03-13',
    timeZone: 'America/Sao_Paulo',
    venue: 'Pista Terra Vermelha',
    city: 'Campo Largo',
    state: 'PR',
    status: 'PUBLISHED',
    registration: { opensAt: '2027-01-15T12:00:00.000Z', closesAt: '2027-03-11T02:59:00.000Z', closedEarly: false, isOpen: true },
    categoryCount: 6,
    heatCount: 6,
    createdAt: '2026-11-21T10:00:00.000Z',
    updatedAt: '2026-11-21T10:00:00.000Z',
    ...patch,
  };
}

export const DRAFT_STAGE_3 = eventDto({
  id: '019a8f00-0000-7000-8000-000000000103',
  name: 'Copa Verão de Motocross - Etapa 3',
  stageNumber: 3,
  startDate: '2027-04-17',
  endDate: '2027-04-18',
  venue: 'Arena Serra Azul',
  city: 'Lages',
  state: 'SC',
  status: 'DRAFT',
  registration: { opensAt: null, closesAt: null, closedEarly: false, isOpen: false },
  categoryCount: 0,
  heatCount: 0,
});

export const CHAMPIONSHIPS: ChampionshipDto[] = [
  { id: '019a8f00-0000-7000-8000-000000000001', name: 'Copa Verão de Motocross', season: 2027, eventCount: 2 },
];

/** Espera as promessas pendentes (respostas HTTP já entregues) e a tela se atualizar. */
export const settle = () => new Promise((resolve) => setTimeout(resolve));
