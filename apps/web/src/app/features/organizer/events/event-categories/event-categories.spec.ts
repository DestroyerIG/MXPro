import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CategoryDto, EventCategoryDto } from '@mxpro/shared';
import { provideTestHttp } from '../../../../core/auth/session.testing';
import { CATEGORIES_URL, eventCategoriesUrl } from '../events-api';
import { settle } from '../events.testing';
import { EventCategories } from './event-categories';

const EVENT_ID = '019a8f00-0000-7000-8000-000000000102';
const URL = eventCategoriesUrl(EVENT_ID);

const MX1: EventCategoryDto = {
  id: 'ec-mx1', eventId: EVENT_ID, category: { id: 'c-mx1', name: 'MX1' }, modality: 'MOTOCROSS',
  entryFeeCents: 15000, maxEntries: 40, heatCount: 2,
};
const XC: EventCategoryDto = {
  id: 'ec-xc', eventId: EVENT_ID, category: { id: 'c-xc', name: 'Cross Country' }, modality: 'CROSS_COUNTRY',
  entryFeeCents: 12050, maxEntries: null, heatCount: 0,
};
const CATALOG: CategoryDto[] = [
  { id: 'c-mx1', name: 'MX1', description: null, active: true, eventCount: 1 },
  { id: 'c-xc', name: 'Cross Country', description: null, active: true, eventCount: 1 },
  { id: 'c-fem', name: 'Feminino', description: null, active: true, eventCount: 0 },
];

describe('EventCategories (aba Categorias do evento)', () => {
  let http: HttpTestingController;

  async function setup(editable = true) {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EventCategories);
    fixture.componentRef.setInput('eventId', EVENT_ID);
    fixture.componentRef.setInput('editable', editable);
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.detectChanges();
    await settle();
    http.expectOne(URL).flush({ categories: [MX1, XC] });
    if (editable) http.expectOne(`${CATEGORIES_URL}?active=true`).flush({ categories: CATALOG });
    await settle();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const control = (label: string) => {
      const l = Array.from(root.querySelectorAll('label')).find((x) => x.textContent?.replace(/\*/g, '').trim() === label)!;
      return root.querySelector<HTMLInputElement & HTMLSelectElement>(`#${l.htmlFor}`)!;
    };
    const type = async (label: string, value: string) => {
      const c = control(label);
      c.value = value;
      c.dispatchEvent(new Event('input'));
      c.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const click = async (text: string, scope: ParentNode = root) => {
      Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text)!.click();
      await settle();
    };
    const rows = () => Array.from(root.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).slice(0, 5).map((td) => td.textContent?.trim()));
    const errors = () => Array.from(root.querySelectorAll('ui-form-field p.text-danger-text')).map((p) => p.textContent?.trim());
    /** Depois de uma alteração: a lista é recarregada. */
    const reloaded = async (list: EventCategoryDto[]) => {
      await settle();
      TestBed.tick(); // roda o ciclo do Angular: o reload() do httpResource dispara a nova busca
      http.expectOne(URL).flush({ categories: list });
      await settle();
      await fixture.whenStable();
    };
    return { fixture, root, control, type, click, rows, errors, changed, reloaded };
  }

  afterEach(() => http.verify());

  it('lista com modalidade, valor em reais e vagas ("Sem limite")', async () => {
    const { rows } = await setup();
    expect(rows()).toEqual([
      ['MX1', 'Motocross', 'R$ 150,00', '40', '2'],
      ['Cross Country', 'Cross Country', 'R$ 120,50', 'Sem limite', '0'],
    ]);
  });

  it('o seletor só oferece categorias do catálogo que ainda não estão no evento', async () => {
    const { control } = await setup();
    expect(Array.from(control('Categoria').options).map((o) => o.textContent)).toEqual(['Escolha…', 'Feminino']);
  });

  it('valor inválido é apontado no campo e nada é enviado', async () => {
    const { type, click, errors } = await setup();
    await type('Categoria', 'c-fem');
    await type('Valor (R$)', '100,555');
    await click('Adicionar categoria');
    expect(errors()).toEqual(['Use um valor em reais, ex.: 150,00.']);
    http.expectNone({ method: 'POST', url: URL });
  });

  it('adiciona enviando o valor em CENTAVOS e vagas em branco como null', async () => {
    const { type, click, changed, reloaded, rows } = await setup();
    await type('Categoria', 'c-fem');
    await type('Valor (R$)', '1.000,5');
    await click('Adicionar categoria');
    const req = http.expectOne({ method: 'POST', url: URL });
    expect(req.request.body).toEqual({ categoryId: 'c-fem', modality: 'MOTOCROSS', entryFeeCents: 100050, maxEntries: null });
    const fem = { ...MX1, id: 'ec-fem', category: { id: 'c-fem', name: 'Feminino' }, entryFeeCents: 100050, maxEntries: null, heatCount: 0 };
    req.flush(fem);
    await reloaded([MX1, XC, fem]);
    expect(changed).toHaveBeenCalled();
    expect(rows()).toHaveLength(3);
  });

  it('editar preenche o formulário e envia só modalidade, valor e vagas', async () => {
    const { root, control, type, click, reloaded } = await setup();
    await click('Editar', root.querySelector('tbody tr')!);
    expect(control('Valor (R$)').value).toBe('150,00');
    expect(control('Vagas').value).toBe('40');
    await type('Vagas', '');
    await click('Salvar categoria');
    const req = http.expectOne({ method: 'PATCH', url: `${URL}/ec-mx1` });
    expect(req.request.body).toEqual({ modality: 'MOTOCROSS', entryFeeCents: 15000, maxEntries: null });
    req.flush({ ...MX1, maxEntries: null });
    await reloaded([{ ...MX1, maxEntries: null }, XC]);
  });

  it('remover categoria em bateria: mostra a mensagem da API', async () => {
    const { root, click, fixture } = await setup();
    await click('Remover', root.querySelector('tbody tr')!);
    http.expectOne({ method: 'DELETE', url: `${URL}/ec-mx1` }).flush(
      { code: 'CATEGORY_IN_HEAT', message: 'Esta categoria está em baterias. Tire-a das baterias antes de removê-la.' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Tire-a das baterias');
  });

  it('somente leitura: sem formulário e sem ações (e nem busca o catálogo)', async () => {
    const { root } = await setup(false);
    expect(root.querySelector('form')).toBeNull();
    expect(root.querySelectorAll('tbody button')).toHaveLength(0);
  });
});
