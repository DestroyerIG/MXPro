import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Role } from '@mxpro/shared';
import { routes } from '../../../../app.routes';
import { provideTestHttp, signInAs } from '../../../../core/auth/session.testing';
import { EVENTS_URL } from '../events-api';
import { DRAFT_STAGE_3, eventDto, settle } from '../events.testing';

describe('EventsList (/painel/eventos)', () => {
  let http: HttpTestingController;

  async function open(role: Role = 'ORGANIZER') {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
    await signInAs(role);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/painel/eventos');
    const root = harness.routeNativeElement as HTMLElement;
    const respond = async (body: object, status = 200) => {
      http.expectOne(EVENTS_URL).flush(body, { status, statusText: status === 200 ? 'OK' : 'Erro' });
      await settle();
      await harness.fixture.whenStable();
    };
    const tableRows = () => Array.from(root.querySelectorAll('table tbody tr'));
    return { harness, root, respond, tableRows };
  }

  afterEach(() => http.verify());

  it('mostra carregando e depois a tabela com período, local, contagens e status', async () => {
    const { root, respond, tableRows } = await open();
    expect(root.querySelector('[aria-busy="true"]')).not.toBeNull();
    await respond({ events: [eventDto(), DRAFT_STAGE_3] });

    // Selos lado a lado: lê um por um (o textContent juntaria "Publicado" e "Inscrições abertas").
    const text = (td: Element) => {
      const badges = Array.from(td.querySelectorAll('ui-status-badge')).map((b) => b.textContent?.trim());
      return badges.length ? badges.join(' ') : td.textContent?.replace(/\s+/g, ' ').trim();
    };
    const rows = tableRows().map((tr) => Array.from(tr.querySelectorAll('td')).map(text));
    expect(rows).toEqual([
      [
        'Copa Verão de Motocross - Etapa 2 Copa Verão de Motocross 2027 • Etapa 2',
        '13/03/2027',
        'Pista Terra Vermelha Campo Largo/PR',
        '6',
        '6',
        'Publicado Inscrições abertas',
      ],
      [
        'Copa Verão de Motocross - Etapa 3 Copa Verão de Motocross 2027 • Etapa 3',
        '17 a 18/04/2027',
        'Arena Serra Azul Lages/SC',
        '0',
        '0',
        'Rascunho',
      ],
    ]);
    expect(root.textContent).toContain('2 eventos • 1 publicado • 1 rascunho');
    // O nome leva ao detalhe do evento.
    expect(tableRows()[0].querySelector('a')?.getAttribute('href')).toBe('/painel/eventos/019a8f00-0000-7000-8000-000000000102');
  });

  it('pílulas mostram a contagem e filtram por status', async () => {
    const { harness, root, respond, tableRows } = await open();
    await respond({ events: [eventDto(), DRAFT_STAGE_3] });
    const pills = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(pills.map((p) => p.textContent?.trim())).toEqual([
      'Todos (2)', 'Rascunho (1)', 'Publicado (1)', 'Encerrado (0)', 'Cancelado (0)',
    ]);
    pills[1].click();
    await harness.fixture.whenStable();
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0].textContent).toContain('Etapa 3');

    pills[3].click();
    await harness.fixture.whenStable();
    expect(root.textContent).toContain('Nenhum evento com esse status.');
  });

  it('organizador vê "Novo evento"; secretaria não', async () => {
    const org = await open('ORGANIZER');
    await org.respond({ events: [] });
    expect(org.root.querySelector('a[href="/painel/eventos/novo"]')).not.toBeNull();
    TestBed.resetTestingModule();

    const sec = await open('SECRETARY');
    await sec.respond({ events: [eventDto()] });
    expect(sec.root.querySelector('a[href="/painel/eventos/novo"]')).toBeNull();
  });

  it('sem eventos: convite para criar o primeiro', async () => {
    const { root, respond } = await open();
    await respond({ events: [] });
    expect(root.textContent).toContain('Nenhum evento cadastrado.');
    expect(root.textContent).toContain('Crie o primeiro evento');
  });

  it('erro ao carregar: mensagem e "Tentar de novo" refaz a busca', async () => {
    const { root, respond } = await open();
    await respond({ code: 'INTERNAL_ERROR', message: 'x' }, 500);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar os eventos.');
    // Sem whenStable aqui: com a nova busca pendente a tela não fica "estável" até a resposta chegar.
    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await settle(); // a nova busca sai um tique depois do clique
    await respond({ events: [eventDto()] });
    expect(root.querySelectorAll('table tbody tr')).toHaveLength(1);
  });
});
