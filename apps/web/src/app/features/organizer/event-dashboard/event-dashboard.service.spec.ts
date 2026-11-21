import type { EventDto } from '@mxpro/shared';
import { DRAFT_STAGE_3, eventDto } from '../events/events.testing';
import { dashboardDto } from './event-dashboard.testing';
import { pickDefaultEvent, toEventDashboard, todayInDefaultZone } from './event-dashboard.service';

describe('toEventDashboard', () => {
  it('calcula pendentes = inscritos − pagos e traduz as modalidades', () => {
    const d = toEventDashboard(dashboardDto({ registrations: { total: 128, paid: 112 } }));
    expect(d.totals).toEqual({ registered: 128, paid: 112, pending: 16, heats: 6 });
    expect(d.modalities).toEqual(['Motocross', 'Cross Country']);
  });

  it('nunca mostra pendente negativo, mesmo com dado inconsistente', () => {
    expect(toEventDashboard(dashboardDto({ registrations: { total: 10, paid: 12 } })).totals.pending).toBe(0);
  });
});

describe('pickDefaultEvent (qual evento o painel abre)', () => {
  const TODAY = '2027-03-01';
  const published = (id: string, startDate: string, endDate = startDate): EventDto =>
    eventDto({ id, startDate, endDate, status: 'PUBLISHED' });

  it('o próximo PUBLICADO que ainda não terminou', () => {
    const events = [published('passado', '2027-02-01'), published('depois', '2027-04-10'), published('proximo', '2027-03-13')];
    expect(pickDefaultEvent(events, TODAY)?.id).toBe('proximo');
  });

  it('evento de vários dias que está acontecendo hoje ainda conta', () => {
    expect(pickDefaultEvent([published('hoje', '2027-02-28', '2027-03-01')], TODAY)?.id).toBe('hoje');
  });

  it('sem publicado futuro: o próximo rascunho', () => {
    const events = [published('passado', '2027-02-01'), { ...DRAFT_STAGE_3, id: 'rascunho' }];
    expect(pickDefaultEvent(events, TODAY)?.id).toBe('rascunho');
  });

  it('tudo no passado: o mais recente; cancelado nunca é o padrão', () => {
    const events = [
      published('antigo', '2026-10-01'),
      published('recente', '2027-02-01'),
      eventDto({ id: 'cancelado', startDate: '2027-03-20', status: 'CANCELED' }),
    ];
    expect(pickDefaultEvent(events, TODAY)?.id).toBe('recente');
  });

  it('nenhum evento: null', () => {
    expect(pickDefaultEvent([], TODAY)).toBeNull();
  });
});

describe('todayInDefaultZone', () => {
  it('usa a data de São Paulo (23:30 de 13/03 em SP ainda é dia 13)', () => {
    expect(todayInDefaultZone(new Date('2027-03-14T02:30:00Z'))).toBe('2027-03-13');
  });
});
