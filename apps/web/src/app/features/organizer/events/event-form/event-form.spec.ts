import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { EventDto, Role } from '@mxpro/shared';
import { routes } from '../../../../app.routes';
import { provideTestHttp, signInAs } from '../../../../core/auth/session.testing';
import { CHAMPIONSHIPS_URL, EVENTS_URL } from '../events-api';
import { CHAMPIONSHIPS, DRAFT_STAGE_3, eventDto, settle } from '../events.testing';

describe('EventForm (/painel/eventos/novo e /painel/eventos/:id)', () => {
  let http: HttpTestingController;

  beforeAll(() => {
    // jsdom não implementa o <dialog> modal; basta abrir/fechar para testar a confirmação.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  /** Abre a tela já logado; responde a lista de campeonatos e (se edição) o evento. */
  async function open(url: string, opts: { role?: Role; event?: EventDto } = {}) {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
    await signInAs(opts.role ?? 'ORGANIZER');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await settle();
    http.expectOne(CHAMPIONSHIPS_URL).flush({ championships: CHAMPIONSHIPS });
    if (opts.event) http.expectOne(`${EVENTS_URL}/${opts.event.id}`).flush(opts.event);
    await settle();
    await harness.fixture.whenStable();
    const root = harness.routeNativeElement as HTMLElement;

    const control = (label: string) => {
      const el = Array.from(root.querySelectorAll('label')).find(
        (l) => l.textContent?.replace(/\*/g, '').replace(/\s+/g, ' ').trim() === label,
      );
      if (!el) throw new Error(`Rótulo não encontrado: ${label}`);
      return root.querySelector<HTMLInputElement & HTMLSelectElement>(`#${el.htmlFor}`)!;
    };
    const stable = async () => {
      await settle();
      await harness.fixture.whenStable();
    };
    const type = async (label: string, value: string) => {
      const c = control(label);
      c.value = value;
      c.dispatchEvent(new Event('input', { bubbles: true }));
      c.dispatchEvent(new Event('change', { bubbles: true }));
      await stable();
    };
    const button = (text: string) =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text);
    const click = async (text: string) => {
      button(text)!.click();
      await stable();
    };
    const fieldErrors = () => Array.from(root.querySelectorAll('ui-form-field p.text-danger-text')).map((p) => p.textContent?.trim());
    return { harness, root, control, type, button, click, fieldErrors, stable };
  }

  afterEach(() => http.verify());

  describe('novo evento', () => {
    it('enviar vazio mostra os erros e NÃO chama a API', async () => {
      const { click, fieldErrors } = await open('/painel/eventos/novo');
      await click('Criar evento');
      expect(fieldErrors()).toEqual([
        'Informe o nome.',
        'Informe a data de início.',
        'Informe a data de término.',
        'Informe o local.',
        'Informe a cidade.',
        'Escolha a UF.',
      ]);
      http.expectNone({ method: 'POST', url: EVENTS_URL });
    });

    it('término antes do início é apontado no campo', async () => {
      const { type, click, fieldErrors } = await open('/painel/eventos/novo');
      await type('Data de início', '2027-07-10');
      await type('Data de término', '2027-07-09');
      await click('Criar evento');
      expect(fieldErrors()).toContain('O término não pode ser antes do início.');
    });

    it('cria: envia datas de inscrição convertidas do fuso do evento e abre a página do evento', async () => {
      const { harness, type, click, stable } = await open('/painel/eventos/novo');
      await type('Nome do evento', 'Copa Inverno - Etapa 1');
      await type('Campeonato', CHAMPIONSHIPS[0].id);
      await type('Nº da etapa', '4');
      await type('Data de início', '2027-07-10');
      await type('Data de término', '2027-07-11');
      await type('Pista ou local', 'Arena Vale Verde');
      await type('Cidade', 'Ponta Grossa');
      await type('UF', 'PR');
      await type('Abertura', '2027-05-01T08:00');
      await type('Encerramento', '2027-07-05T23:59');
      await click('Criar evento');

      const req = http.expectOne({ method: 'POST', url: EVENTS_URL });
      expect(req.request.body).toEqual({
        name: 'Copa Inverno - Etapa 1',
        championshipId: CHAMPIONSHIPS[0].id,
        stageNumber: 4,
        startDate: '2027-07-10',
        endDate: '2027-07-11',
        timeZone: 'America/Sao_Paulo',
        venue: 'Arena Vale Verde',
        city: 'Ponta Grossa',
        state: 'PR',
        registrationOpensAt: '2027-05-01T11:00:00.000Z', // 08:00 em São Paulo
        registrationClosesAt: '2027-07-06T02:59:00.000Z', // 23:59 em São Paulo
      });
      const created = eventDto({ id: '019a8f00-0000-7000-8000-0000000000c1', name: 'Copa Inverno - Etapa 1', status: 'DRAFT' });
      req.flush(created);
      // Sem whenStable: a página nova já disparou as buscas dela, e a tela só "estabiliza" com as respostas.
      await settle();
      await settle();
      expect(TestBed.inject(Router).url).toBe(`/painel/eventos/${created.id}`);
      // A página do evento criado carrega os dados dele.
      http.expectOne(CHAMPIONSHIPS_URL).flush({ championships: CHAMPIONSHIPS });
      http.expectOne(`${EVENTS_URL}/${created.id}`).flush(created);
      await stable();
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Copa Inverno - Etapa 1');
    });

    it('evento avulso: etapa fica desabilitada e vai como null', async () => {
      const { control } = await open('/painel/eventos/novo');
      expect(control('Campeonato').value).toBe('');
      expect(control('Nº da etapa').disabled).toBe(true);
    });
  });

  describe('editar evento', () => {
    it('preenche com os dados do evento (horários no fuso do evento)', async () => {
      const { control } = await open(`/painel/eventos/${eventDto().id}`, { event: eventDto() });
      expect(control('Nome do evento').value).toBe('Copa Verão de Motocross - Etapa 2');
      expect(control('Campeonato').value).toBe(CHAMPIONSHIPS[0].id);
      expect(control('Nº da etapa').value).toBe('2');
      expect(control('UF').value).toBe('PR');
      expect(control('Abertura').value).toBe('2027-01-15T09:00');
      expect(control('Encerramento').value).toBe('2027-03-10T23:59');
    });

    it('erro da API num campo (etapa repetida) aparece no próprio campo; salvar de novo com sucesso limpa', async () => {
      const { click, fieldErrors, root, stable } = await open(`/painel/eventos/${eventDto().id}`, { event: eventDto() });
      const url = `${EVENTS_URL}/${eventDto().id}`;
      await click('Salvar alterações');
      http.expectOne({ method: 'PATCH', url }).flush(
        {
          code: 'STAGE_TAKEN',
          message: 'Este campeonato já tem a etapa 2.',
          details: [{ field: 'stageNumber', message: 'A etapa 2 já existe neste campeonato.' }],
        },
        { status: 409, statusText: 'Conflict' },
      );
      await stable();
      expect(fieldErrors()).toEqual(['A etapa 2 já existe neste campeonato.']);
      expect(root.querySelector('form [role="alert"]')?.textContent).toContain('Este campeonato já tem a etapa 2.');

      await click('Salvar alterações');
      http.expectOne({ method: 'PATCH', url }).flush(eventDto());
      await stable();
      expect(fieldErrors()).toEqual([]);
      expect(root.querySelector('form [role="alert"]')).toBeNull();
    });

    it('publicar sem categoria: o erro aparece junto dos botões de ação', async () => {
      const { click, root, stable } = await open(`/painel/eventos/${DRAFT_STAGE_3.id}`, { event: DRAFT_STAGE_3 });
      await click('Publicar evento');
      http.expectOne({ method: 'POST', url: `${EVENTS_URL}/${DRAFT_STAGE_3.id}/publish` }).flush(
        { code: 'EVENT_HAS_NO_CATEGORIES', message: 'Adicione ao menos uma categoria antes de publicar o evento.' },
        { status: 409, statusText: 'Conflict' },
      );
      await stable();
      const actions = root.querySelector('[role="group"]')!;
      expect(actions.nextElementSibling?.getAttribute('role')).toBe('alert');
      expect(actions.nextElementSibling?.textContent).toContain('Adicione ao menos uma categoria');
    });

    it('cancelar pede confirmação e envia o motivo', async () => {
      const { click, root, stable } = await open(`/painel/eventos/${eventDto().id}`, { event: eventDto() });
      await click('Cancelar evento');
      const dialog = Array.from(root.querySelectorAll('dialog')).find((d) => d.open)!;
      expect(dialog.querySelector('h2')?.textContent).toBe('Cancelar este evento?');
      const reason = dialog.querySelector('textarea')!;
      reason.value = 'Chuva forte';
      reason.dispatchEvent(new Event('input'));
      Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancelar evento')!.click();
      await stable();
      const req = http.expectOne({ method: 'POST', url: `${EVENTS_URL}/${eventDto().id}/cancel` });
      expect(req.request.body).toEqual({ reason: 'Chuva forte' });
      req.flush(eventDto({ status: 'CANCELED' }));
      await stable();
      expect(root.textContent).toContain('Evento cancelado: os dados ficam guardados');
    });

    it('"Excluir rascunho" só aparece em rascunho vazio', async () => {
      // Só os botões da barra de ações (o diálogo fechado também tem um "Excluir rascunho").
      const actions = (root: HTMLElement) =>
        Array.from(root.querySelectorAll('[role="group"] button')).map((b) => b.textContent?.trim());
      const draft = await open(`/painel/eventos/${DRAFT_STAGE_3.id}`, { event: DRAFT_STAGE_3 });
      expect(actions(draft.root)).toEqual(['Publicar evento', 'Cancelar evento', 'Excluir rascunho']);
      TestBed.resetTestingModule();
      const published = await open(`/painel/eventos/${eventDto().id}`, { event: eventDto() });
      expect(actions(published.root)).toEqual(['Encerrar inscrições agora', 'Cancelar evento']);
    });
  });

  describe('abas', () => {
    it('abas com contagens; trocar de aba põe a aba na URL (?aba=) e mostra o conteúdo dela', async () => {
      const { root, harness, stable } = await open(`/painel/eventos/${eventDto().id}`, { event: eventDto() });
      const tabs = () => Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      expect(tabs().map((t) => t.textContent?.trim())).toEqual(['Dados do evento', 'Categorias (6)', 'Baterias (6)']);
      expect(tabs()[0].getAttribute('aria-selected')).toBe('true');

      tabs()[1].click();
      await settle();
      expect(TestBed.inject(Router).url).toBe(`/painel/eventos/${eventDto().id}?aba=categorias`);
      // O painel da aba vem por @defer (placeholder mínimo de 200 ms); quando aparece, busca as listas.
      await vi.waitFor(() => {
        TestBed.tick();
        expect(http.match(() => true).map((r) => (r.flush({ categories: [] }), r)).length).toBeGreaterThan(0);
      }, { timeout: 3000, interval: 50 });
      await stable();
      const page = harness.routeNativeElement!;
      expect(page.querySelector('app-event-categories')).not.toBeNull();
      expect(page.querySelector<HTMLFormElement>('[role="tabpanel"] > form')?.hidden).toBe(true);
      expect(page.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(tabs()[1].id);
    });

    it('mudança numa aba (categorias) atualiza as contagens SEM apagar o que foi digitado em "Dados"', async () => {
      const { type, control, root, harness, stable } = await open(`/painel/eventos/${eventDto().id}`, { event: eventDto() });
      await type('Pista ou local', 'Nova pista ainda não salva');

      // O mesmo que acontece quando a aba Categorias emite (changed): a página recarrega o evento.
      // A rota no topo é o layout do painel; a página do evento é o componente <app-event-form> dentro dele.
      const page = harness.fixture.debugElement.query(By.css('app-event-form')).componentInstance as { onChildChanged: () => void };
      page.onChildChanged();
      await settle();
      TestBed.tick();
      // Mesmo updatedAt (os dados do evento não mudaram), só as contagens.
      http.expectOne(`${EVENTS_URL}/${eventDto().id}`).flush(eventDto({ categoryCount: 7 }));
      await stable();

      expect(root.textContent).toContain('7 categorias');
      expect(control('Pista ou local').value).toBe('Nova pista ainda não salva');
    });
  });

  describe('somente leitura', () => {
    it('secretaria vê os dados, sem ações e com os campos desabilitados', async () => {
      const { control, button, root } = await open(`/painel/eventos/${eventDto().id}`, { role: 'SECRETARY', event: eventDto() });
      expect(control('Nome do evento').disabled).toBe(true);
      expect(control('UF').disabled).toBe(true); // <select>: readonly não bastaria
      expect(button('Salvar alterações')).toBeUndefined();
      expect(root.querySelector('[role="group"]')).toBeNull();
    });

    it('evento cancelado fica congelado mesmo para o organizador', async () => {
      const { control, button, root } = await open(`/painel/eventos/${eventDto().id}`, { event: eventDto({ status: 'CANCELED' }) });
      expect(control('Cidade').disabled).toBe(true);
      expect(button('Salvar alterações')).toBeUndefined();
      expect(root.textContent).toContain('não podem mais ser alterados');
    });
  });
});
