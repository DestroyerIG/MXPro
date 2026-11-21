import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { EventDto } from '@mxpro/shared';
import { SessionService } from '../../../core/auth/session.service';
import { formatDateRange, formatEventDay, formatEventTime } from '../../../shared/format/date-time';
import { plural } from '../../../shared/format/plural';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { StatTile } from '../../../shared/ui/stat-tile/stat-tile';
import { StatusBadge, type StatusTone } from '../../../shared/ui/status-badge/status-badge';
import { EVENTS_URL } from '../events/events-api';
import { EVENT_STATUS, registrationBadge } from '../events/event-status';
import { type CategoryBarItem, CategoryBars } from './category-bars/category-bars';
import type { DashboardHeatDto, EventDashboard as EventDashboardData } from './event-dashboard.model';
import { dashboardUrl, pickDefaultEvent, toEventDashboard, todayInDefaultZone } from './event-dashboard.service';

/** Como cada situação de bateria aparece (texto + tom do selo). */
const HEAT_STATUS: Record<DashboardHeatDto['status'], { label: string; tone: StatusTone }> = {
  READY: { label: 'Pronta', tone: 'ok' },
  GRID_PENDING: { label: 'Grid pendente', tone: 'warn' },
  WAITING: { label: 'Aguardando', tone: 'idle' },
};

/**
 * Painel do evento (docs/arquitetura.md §4.1, PDF página 3), com dados reais da API.
 * O evento mostrado vem de `?evento=` na URL; sem ele, abre o próximo evento publicado.
 */
@Component({
  selector: 'app-event-dashboard',
  imports: [RouterLink, Button, Card, StatTile, StatusBadge, CategoryBars],
  templateUrl: './event-dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDashboard {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);

  /** `?evento=<id>` (withComponentInputBinding). */
  readonly evento = input<string>();

  protected readonly canEdit = computed(() => this.session.user()?.role === 'ORGANIZER');
  protected readonly events = httpResource<{ events: EventDto[] }>(() => EVENTS_URL);
  protected readonly eventList = computed(() => this.events.value()?.events ?? []);

  /** Evento mostrado: o da URL ou, sem escolha, o próximo publicado. */
  protected readonly selectedId = computed(() => this.evento() ?? pickDefaultEvent(this.eventList(), todayInDefaultZone())?.id);

  /**
   * httpResource com `parse`: a resposta da API passa por `toEventDashboard` antes de virar o
   * valor do signal (totais derivados, rótulos). Trocar de evento muda a URL lida aqui e o
   * resource busca de novo sozinho, cancelando a busca anterior se ainda estiver em andamento.
   */
  protected readonly dashboard = httpResource<EventDashboardData>(
    () => {
      const id = this.selectedId();
      return id ? dashboardUrl(id) : undefined;
    },
    { parse: (raw) => toEventDashboard(raw as Parameters<typeof toEventDashboard>[0]) },
  );

  protected readonly heatStatus = HEAT_STATUS;

  /** Linha de detalhes do cabeçalho: período • local • modalidades. */
  protected readonly subtitle = computed(() => {
    if (!this.dashboard.hasValue()) return '';
    const { event, modalities } = this.dashboard.value();
    return [formatDateRange(event.startDate, event.endDate), `${event.venue}, ${event.city}/${event.state}`, modalities.join(' + ')]
      .filter(Boolean)
      .join(' • ');
  });

  /** Selo do cabeçalho: situação das inscrições (publicado) ou o status do evento. */
  protected readonly badge = computed(() => {
    if (!this.dashboard.hasValue()) return null;
    const e = this.dashboard.value().event;
    return registrationBadge(e) ?? EVENT_STATUS[e.status];
  });

  /** Próximas baterias com textos prontos para a lista. */
  protected readonly heats = computed(() => {
    if (!this.dashboard.hasValue()) return [];
    const { event, upcomingHeats } = this.dashboard.value();
    const multiDay = event.startDate !== event.endDate;
    return upcomingHeats.map((h) => ({
      ...h,
      time: h.scheduledAt ? formatEventTime(h.scheduledAt, event.timeZone) : 'A definir',
      day: multiDay && h.scheduledAt ? formatEventDay(h.scheduledAt, event.timeZone) : null,
      title: `${h.categoryNames.join(' + ')} - ${h.name}`,
      pilots: plural(h.pilotCount, 'piloto', 'pilotos'),
      status: HEAT_STATUS[h.status],
    }));
  });

  /** Barras do gráfico: só quando já há inscritos (senão o gráfico seria todo zero). */
  protected readonly categoryBars = computed<CategoryBarItem[]>(() => {
    if (!this.dashboard.hasValue()) return [];
    const list = this.dashboard.value().registrationsByCategory;
    if (!list.some((c) => c.count > 0)) return [];
    return list.map((c) => ({ id: c.eventCategoryId, label: c.categoryName, count: c.count }));
  });

  protected selectEvent(id: string): void {
    void this.router.navigate([], { queryParams: { evento: id }, replaceUrl: true });
  }

  protected eventLabel(e: EventDto): string {
    return `${e.name} (${formatDateRange(e.startDate, e.endDate)})${e.status === 'PUBLISHED' ? '' : ` - ${EVENT_STATUS[e.status].label}`}`;
  }
}
