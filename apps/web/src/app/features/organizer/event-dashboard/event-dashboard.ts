import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { EventDatePipe } from '../../../shared/format/event-date.pipe';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { StatTile } from '../../../shared/ui/stat-tile/stat-tile';
import { StatusBadge, StatusTone } from '../../../shared/ui/status-badge/status-badge';
import { CategoryBarItem, CategoryBars } from './category-bars/category-bars';
import { HeatStatus, RegistrationWindow } from './event-dashboard.model';
import { CURRENT_EVENT_ID, EventDashboardService } from './event-dashboard.service';

/** Como cada estado de bateria aparece (texto + tom do badge). */
const HEAT_STATUS: Record<HeatStatus, { label: string; tone: StatusTone }> = {
  READY: { label: 'Pronta', tone: 'ok' },
  GRID_PENDING: { label: 'Grid pendente', tone: 'warn' },
  WAITING: { label: 'Aguardando', tone: 'idle' },
};

const REGISTRATION_WINDOW: Record<RegistrationWindow, { label: string; tone: StatusTone }> = {
  OPEN: { label: 'INSCRIÇÕES ABERTAS', tone: 'ok' },
  CLOSED: { label: 'INSCRIÇÕES ENCERRADAS', tone: 'idle' },
};

/** Painel do evento (docs/arquitetura.md §4.1, PDF página 3). */
@Component({
  selector: 'app-event-dashboard',
  imports: [Button, Card, StatTile, StatusBadge, CategoryBars, EventDatePipe],
  templateUrl: './event-dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDashboard {
  private readonly service = inject(EventDashboardService);

  /**
   * resource(): busca assíncrona exposta como signals (value, isLoading, error…).
   * `params` é reativo: quando o evento atual virar um signal (seletor de evento), trocar de
   * evento recarrega sozinho. Alternativa: assinar um Observable no ngOnInit e guardar em
   * variáveis; o resource já entrega carregando/erro/recarregar prontos.
   * Com a API, isto vira `httpResource(() => \`/api/events/${id}/dashboard\`)`.
   */
  protected readonly dashboard = resource({
    params: () => ({ eventId: CURRENT_EVENT_ID }),
    loader: ({ params, abortSignal }) => this.service.load(params.eventId, abortSignal),
  });

  protected readonly heatStatus = HEAT_STATUS;
  protected readonly registrationWindow = REGISTRATION_WINDOW;

  /** Adapta os dados para o gráfico. hasValue() protege: value() lança erro no estado "error". */
  protected readonly categoryBars = computed<CategoryBarItem[]>(() =>
    this.dashboard.hasValue()
      ? this.dashboard.value().registrationsByCategory.map((c) => ({
          id: c.categoryId,
          label: c.categoryName,
          count: c.count,
        }))
      : [],
  );
}
