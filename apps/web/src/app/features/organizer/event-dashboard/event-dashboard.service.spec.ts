import { TestBed } from '@angular/core/testing';
import { MOCK_EVENT_DASHBOARD } from './event-dashboard.mock';
import { type EventDashboardDto } from './event-dashboard.model';
import { EventDashboardService, toEventDashboard } from './event-dashboard.service';

describe('toEventDashboard', () => {
  it('calcula pendentes = inscritos − pagos', () => {
    const d = toEventDashboard(MOCK_EVENT_DASHBOARD);
    expect(d.totals).toEqual({ registered: 128, paid: 112, pending: 16, heats: 6 });
  });

  it('ordena as próximas baterias por horário', () => {
    const d = toEventDashboard(MOCK_EVENT_DASHBOARD);
    expect(d.upcomingHeats.map((h) => h.id)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  });

  it('nunca mostra pendente negativo, mesmo com dado inconsistente', () => {
    const dto: EventDashboardDto = { ...MOCK_EVENT_DASHBOARD, registrations: { total: 10, paid: 12 } };
    expect(toEventDashboard(dto).totals.pending).toBe(0);
  });

  it('não altera o objeto recebido', () => {
    const before = MOCK_EVENT_DASHBOARD.upcomingHeats.map((h) => h.id);
    toEventDashboard(MOCK_EVENT_DASHBOARD);
    expect(MOCK_EVENT_DASHBOARD.upcomingHeats.map((h) => h.id)).toEqual(before);
  });
});

describe('EventDashboardService', () => {
  it('carrega o painel do evento pedido', async () => {
    vi.useFakeTimers();
    const service = TestBed.inject(EventDashboardService);
    const promise = service.load('copa-verao-mx-etapa-2');
    await vi.runAllTimersAsync();
    expect((await promise).event.name).toBe('Copa Verão de Motocross - Etapa 2');
    vi.useRealTimers();
  });

  it('recusa evento desconhecido com mensagem em pt-BR', async () => {
    const service = TestBed.inject(EventDashboardService);
    await expect(service.load('nao-existe')).rejects.toThrow('Evento não encontrado');
  });
});
