import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EVENT_STATUSES, type EventDto, type EventStatus } from '@mxpro/shared';
import { SessionService } from '../../../../core/auth/session.service';
import { formatDateRange } from '../../../../shared/format/date-time';
import { plural } from '../../../../shared/format/plural';
import { Button } from '../../../../shared/ui/button/button';
import { StatusBadge } from '../../../../shared/ui/status-badge/status-badge';
import { Table } from '../../../../shared/ui/table/table';
import { type TabItem, Tabs } from '../../../../shared/ui/tabs/tabs';
import { EVENTS_URL } from '../events-api';
import { EVENT_STATUS, registrationBadge } from '../event-status';

type Filter = 'ALL' | EventStatus;

/** Linha da tabela já com os textos prontos (nada de cálculo no template). */
interface EventRow {
  event: EventDto;
  period: string;
  stage: string | null;
  status: (typeof EVENT_STATUS)[EventStatus];
  registration: ReturnType<typeof registrationBadge>;
  counts: string;
}

/**
 * Lista de eventos (/painel/eventos), no padrão de listas do PDF: filtros em pílula, tabela com
 * cabeçalho grafite e totais no rodapé. Organizador cria; secretaria só consulta.
 */
@Component({
  selector: 'app-events-list',
  imports: [RouterLink, Button, StatusBadge, Table, Tabs],
  templateUrl: './events-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsList {
  /**
   * httpResource: GET que vira estado reativo (value, isLoading, error, reload). A função entre
   * parênteses é reativa: se ela lesse um signal (ex.: um filtro), mudar o signal refaria a busca.
   * Aqui buscamos todos e filtramos na tela, para mostrar a contagem de cada status nas pílulas.
   */
  protected readonly resource = httpResource<{ events: EventDto[] }>(() => EVENTS_URL);

  private readonly session = inject(SessionService);
  /** Só o organizador cria (a API também barra; aqui é para não mostrar um botão que daria erro). */
  protected readonly canEdit = computed(() => this.session.user()?.role === 'ORGANIZER');
  protected readonly filter = signal<Filter>('ALL');

  private readonly all = computed<EventRow[]>(() =>
    (this.resource.value()?.events ?? []).map((event) => ({
      event,
      period: formatDateRange(event.startDate, event.endDate),
      stage: event.championship
        ? `${event.championship.name} ${event.championship.season}${event.stageNumber ? ` • Etapa ${event.stageNumber}` : ''}`
        : null,
      status: EVENT_STATUS[event.status],
      registration: registrationBadge(event),
      counts: `${plural(event.categoryCount, 'categoria', 'categorias')} • ${plural(event.heatCount, 'bateria', 'baterias')}`,
    })),
  );

  protected readonly rows = computed(() => {
    const f = this.filter();
    return f === 'ALL' ? this.all() : this.all().filter((r) => r.event.status === f);
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const count = (s: EventStatus) => this.all().filter((r) => r.event.status === s).length;
    return [
      { id: 'ALL', label: `Todos (${this.all().length})` },
      ...EVENT_STATUSES.map((s) => ({ id: s, label: `${EVENT_STATUS[s].label} (${count(s)})` })),
    ];
  });

  /** Rodapé no estilo do PDF: "3 eventos • 1 publicado • 1 rascunho". */
  protected readonly summary = computed(() => {
    const rows = this.all();
    const n = (s: EventStatus) => rows.filter((r) => r.event.status === s).length;
    const parts = [`${rows.length} ${rows.length === 1 ? 'evento' : 'eventos'}`];
    const published = n('PUBLISHED');
    const drafts = n('DRAFT');
    if (published) parts.push(`${published} ${published === 1 ? 'publicado' : 'publicados'}`);
    if (drafts) parts.push(`${drafts} ${drafts === 1 ? 'rascunho' : 'rascunhos'}`);
    return parts.join(' • ');
  });

  protected selectFilter(id: string): void {
    this.filter.set(id as Filter);
  }
}
