import { DEFAULT_TIME_ZONE, type EventDto, MODALITY_LABELS, calendarDateIn } from '@mxpro/shared';
import { EVENTS_URL } from '../events/events-api';
import type { EventDashboard, EventDashboardDto } from './event-dashboard.model';

/** Endereço do painel de um evento na API. */
export const dashboardUrl = (eventId: string) => `${EVENTS_URL}/${eventId}/dashboard`;

/**
 * Regras de apresentação do painel (funções puras: fáceis de testar, sem Angular).
 * A busca em si é um `httpResource` no componente, com `parse: toEventDashboard`.
 */
export function toEventDashboard(dto: EventDashboardDto): EventDashboard {
  const { total, paid } = dto.registrations;
  return {
    event: dto.event,
    modalities: dto.modalities.map((m) => MODALITY_LABELS[m]),
    totals: { registered: total, paid, pending: Math.max(0, total - paid), heats: dto.heatCount },
    upcomingHeats: dto.upcomingHeats,
    registrationsByCategory: dto.registrationsByCategory,
  };
}

/**
 * Evento que o painel abre quando nenhum foi escolhido: o próximo publicado (que ainda não
 * terminou); senão o próximo rascunho; senão o mais recente que já passou. Cancelado nunca é o padrão.
 * `today` = "AAAA-MM-DD" (data de hoje no fuso padrão).
 */
export function pickDefaultEvent(events: readonly EventDto[], today: string): EventDto | null {
  const active = events.filter((e) => e.status !== 'CANCELED');
  const byStart = (a: EventDto, b: EventDto) => a.startDate.localeCompare(b.startDate);
  const upcoming = (status: EventDto['status']) =>
    active.filter((e) => e.status === status && e.endDate >= today).sort(byStart)[0];
  return upcoming('PUBLISHED') ?? upcoming('DRAFT') ?? [...active].sort(byStart).at(-1) ?? null;
}

/** Hoje, no fuso padrão dos eventos. */
export function todayInDefaultZone(now = new Date()): string {
  return calendarDateIn(now, DEFAULT_TIME_ZONE);
}
