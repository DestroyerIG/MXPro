import { TestBed } from '@angular/core/testing';
import { EventDashboard } from './event-dashboard';
import { MOCK_EVENT_DASHBOARD } from './event-dashboard.mock';
import { EventDashboardService, toEventDashboard } from './event-dashboard.service';

describe('EventDashboard (tela)', () => {
  /** Substitui o service real por um falso: a tela é testada sem depender do atraso simulado. */
  async function render(load: () => Promise<unknown>, { waitStable = true } = {}) {
    TestBed.configureTestingModule({ providers: [{ provide: EventDashboardService, useValue: { load } }] });
    const fixture = TestBed.createComponent(EventDashboard);
    if (waitStable) await fixture.whenStable();
    else fixture.detectChanges(); // carregamento sem fim nunca "estabiliza": só desenha uma vez
    return fixture.nativeElement as HTMLElement;
  }
  /** Texto visível, separando nós de texto por espaço (como as colunas aparecem na tela). */
  const text = (el: Element | null): string => {
    if (!el) return '';
    const parts: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? '');
    return parts.join(' ').replace(/\s+/g, ' ').replace(/ :/g, ':').trim();
  };

  it('mostra cabeçalho do evento com data no fuso do evento', async () => {
    const el = await render(async () => toEventDashboard(MOCK_EVENT_DASHBOARD));
    expect(text(el.querySelector('h1'))).toBe('Copa Verão de Motocross - Etapa 2');
    expect(text(el.querySelector('header p'))).toBe(
      'Sábado, 13/03 • Pista Terra Vermelha • Motocross + Cross Country',
    );
    expect(text(el.querySelector('header ui-status-badge'))).toBe('INSCRIÇÕES ABERTAS');
  });

  it('mostra os 4 totais', async () => {
    const el = await render(async () => toEventDashboard(MOCK_EVENT_DASHBOARD));
    const tiles = Array.from(el.querySelectorAll('ui-stat-tile')).map(text);
    expect(tiles).toEqual(['Inscritos 128', 'Pagos 112', 'Pendentes 16', 'Baterias 6']);
  });

  it('lista as baterias em ordem, com horário local e situação', async () => {
    const el = await render(async () => toEventDashboard(MOCK_EVENT_DASHBOARD));
    const rows = Array.from(el.querySelectorAll('ui-card:first-of-type li')).map(text);
    expect(rows[0]).toBe('09:00 MX1 - Bateria 1 24 pilotos Pronta');
    expect(rows[2]).toBe('10:20 Feminino - Única 9 pilotos Grid pendente');
    expect(rows[5]).toBe('13:00 MX1 - Bateria 2 24 pilotos Aguardando');
  });

  it('desenha uma barra por categoria, proporcional à maior', async () => {
    const el = await render(async () => toEventDashboard(MOCK_EVENT_DASHBOARD));
    const items = Array.from(el.querySelectorAll('app-category-bars li'));
    expect(items.map(text)).toContain('MX2: 31 inscritos');
    const widths = items.map((li) => (li.querySelector('[aria-hidden="true"]') as HTMLElement).style.width);
    expect(widths[1]).toBe('85%'); // MX2 é a maior
  });

  it('mostra erro com "Tentar de novo" que recarrega', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(toEventDashboard(MOCK_EVENT_DASHBOARD));
    const el = await render(load);
    expect(text(el.querySelector('[role="alert"] h1'))).toBe('Não foi possível carregar o painel do evento.');

    (el.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(el.querySelector('h1')?.textContent).toContain('Copa Verão'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('mostra o esqueleto enquanto carrega', async () => {
    const el = await render(() => new Promise(() => {}), { waitStable: false });
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
