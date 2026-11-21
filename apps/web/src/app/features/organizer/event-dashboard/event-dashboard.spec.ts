import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { EventDashboardDto, EventDto, Role } from '@mxpro/shared';
import { routes } from '../../../app.routes';
import { provideTestHttp, signInAs } from '../../../core/auth/session.testing';
import { EVENTS_URL } from '../events/events-api';
import { DRAFT_STAGE_3, eventDto, settle } from '../events/events.testing';
import { dashboardUrl } from './event-dashboard.service';
import { dashboardDto } from './event-dashboard.testing';

describe('EventDashboard (painel do evento com dados da API)', () => {
  let http: HttpTestingController;

  /** Texto visível, separando nós de texto por espaço (como as colunas aparecem na tela). */
  const text = (el: Element | null | undefined): string => {
    if (!el) return '';
    const parts: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? '');
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };

  async function open(url = '/painel', opts: { role?: Role; events?: EventDto[] } = {}) {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
    await signInAs(opts.role ?? 'ORGANIZER');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await settle();
    http.expectOne(EVENTS_URL).flush({ events: opts.events ?? [eventDto(), DRAFT_STAGE_3] });
    await settle();
    TestBed.tick();
    const page = () => harness.routeNativeElement!.querySelector('app-event-dashboard') as HTMLElement;
    const respond = async (id: string, body: EventDashboardDto | null, status = 200) => {
      http.expectOne(dashboardUrl(id)).flush(body, { status, statusText: status === 200 ? 'OK' : 'Erro' });
      await settle();
      await harness.fixture.whenStable();
    };
    return { harness, page, respond };
  }

  afterEach(() => http.verify());

  it('sem escolha, abre o próximo evento publicado e mostra cabeçalho, aviso e totais', async () => {
    const { page, respond } = await open();
    await respond(eventDto().id, dashboardDto());
    expect(text(page().querySelector('h1'))).toBe('Copa Verão de Motocross - Etapa 2');
    expect(text(page().querySelector('header p'))).toBe(
      '13/03/2027 • Pista Terra Vermelha, Campo Largo/PR • Motocross + Cross Country',
    );
    expect(text(page().querySelector('header ui-status-badge'))).toBe('Inscrições abertas');
    expect(page().textContent).toContain('As inscrições ainda não estão disponíveis no sistema');
    const tiles = Array.from(page().querySelectorAll('ui-stat-tile')).map((t) => text(t));
    expect(tiles).toEqual(['Inscritos 0', 'Pagos 0', 'Pendentes 0', 'Baterias 6']);
  });

  it('próximas baterias: horário no fuso do evento, categorias juntas, "A definir" e situação', async () => {
    const { page, respond } = await open();
    await respond(eventDto().id, dashboardDto());
    const items = Array.from(page().querySelectorAll('ui-card li')).map((li) => text(li));
    expect(items).toEqual([
      '09:00 MX1 - Bateria 1 0 pilotos Aguardando',
      '09:40 Master 35+ + MX2 - Bateria 1 0 pilotos Aguardando',
      'A definir MX1 - Final 1 piloto Pronta',
    ]);
  });

  it('sem inscritos: o gráfico dá lugar a uma frase (nada de barras zeradas)', async () => {
    const { page, respond } = await open();
    await respond(eventDto().id, dashboardDto());
    expect(page().querySelector('app-category-bars')).toBeNull();
    expect(page().textContent).toContain('Ainda não há inscritos nas 2 categorias do evento.');
  });

  it('com inscritos: desenha as barras', async () => {
    const { page, respond } = await open();
    await respond(
      eventDto().id,
      dashboardDto({
        registrations: { total: 55, paid: 40 },
        registrationsByCategory: [
          { eventCategoryId: 'ec-mx1', categoryName: 'MX1', count: 24 },
          { eventCategoryId: 'ec-mx2', categoryName: 'MX2', count: 31 },
        ],
      }),
    );
    expect(page().querySelectorAll('app-category-bars li')).toHaveLength(2);
    expect(text(page().querySelector('ui-stat-tile:nth-child(3)'))).toBe('Pendentes 15');
  });

  it('?evento= escolhe o evento; o seletor troca e grava na URL', async () => {
    const { page, respond, harness } = await open(`/painel?evento=${DRAFT_STAGE_3.id}`);
    await respond(DRAFT_STAGE_3.id, dashboardDto({ event: DRAFT_STAGE_3, upcomingHeats: [], registrationsByCategory: [], heatCount: 0 }));
    expect(text(page().querySelector('h1'))).toBe('Copa Verão de Motocross - Etapa 3');
    expect(text(page().querySelector('header ui-status-badge'))).toBe('Rascunho');
    expect(page().textContent).toContain('Nenhuma bateria programada.');
    expect(page().textContent).toContain('O evento ainda não tem categorias.');

    const select = page().querySelector<HTMLSelectElement>('#dashboard-event')!;
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual([
      'Copa Verão de Motocross - Etapa 2 (13/03/2027)',
      'Copa Verão de Motocross - Etapa 3 (17 a 18/04/2027) - Rascunho',
    ]);
    select.value = eventDto().id;
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(TestBed.inject(Router).url).toBe(`/painel?evento=${eventDto().id}`);
    TestBed.tick();
    await respond(eventDto().id, dashboardDto());
    expect(text(harness.routeNativeElement!.querySelector('app-event-dashboard h1'))).toBe('Copa Verão de Motocross - Etapa 2');
  });

  it('nenhum evento cadastrado: convite para criar (organizador)', async () => {
    const { page, harness } = await open('/painel', { events: [] });
    await harness.fixture.whenStable();
    expect(page().textContent).toContain('Ainda não há eventos.');
    expect(page().querySelector('a[href="/painel/eventos/novo"]')).not.toBeNull();
  });

  it('erro ao carregar o painel: "Tentar de novo" busca outra vez', async () => {
    const { page, respond } = await open();
    await respond(eventDto().id, null, 500);
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar o painel do evento.');
    page().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await settle();
    TestBed.tick();
    await respond(eventDto().id, dashboardDto());
    expect(page().querySelector('h1')?.textContent).toContain('Etapa 2');
  });

  it('mostra o esqueleto enquanto carrega', async () => {
    const { page } = await open();
    expect(page().querySelector('[aria-busy="true"]')).not.toBeNull();
    http.expectOne(dashboardUrl(eventDto().id)).flush(dashboardDto());
  });
});
