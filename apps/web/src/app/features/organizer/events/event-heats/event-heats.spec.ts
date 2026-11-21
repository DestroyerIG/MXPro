import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { EventCategoryDto, HeatDto } from '@mxpro/shared';
import { provideTestHttp } from '../../../../core/auth/session.testing';
import { eventCategoriesUrl, heatsUrl } from '../events-api';
import { DRAFT_STAGE_3, settle } from '../events.testing';
import { EventHeats } from './event-heats';

// Etapa 3: dois dias (17 e 18/04/2027), fuso de São Paulo.
const EVENT = DRAFT_STAGE_3;
const HEATS = heatsUrl(EVENT.id);
const CATS = eventCategoriesUrl(EVENT.id);

const category = (id: string, name: string): EventCategoryDto => ({
  id, eventId: EVENT.id, category: { id: `c-${id}`, name }, modality: 'MOTOCROSS', entryFeeCents: 15000, maxEntries: null, heatCount: 0,
});
const CATEGORIES = [category('ec-mx1', 'MX1'), category('ec-mx2', 'MX2')];
const HEAT: HeatDto = {
  id: 'h1', eventId: EVENT.id, name: 'Bateria 1', scheduledAt: '2027-04-18T12:00:00.000Z', status: 'SCHEDULED',
  categories: [{ eventCategoryId: 'ec-mx1', categoryId: 'c-mx1', name: 'MX1' }, { eventCategoryId: 'ec-mx2', categoryId: 'c-mx2', name: 'MX2' }],
};
const UNSCHEDULED: HeatDto = { ...HEAT, id: 'h2', name: 'Final', scheduledAt: null, categories: [HEAT.categories[0]] };
const RUNNING: HeatDto = { ...HEAT, id: 'h3', name: 'Bateria 2', status: 'IN_PROGRESS' };

describe('EventHeats (aba Baterias do evento)', () => {
  let http: HttpTestingController;

  async function setup(heats: HeatDto[] = [HEAT, UNSCHEDULED], editable = true) {
    TestBed.configureTestingModule({ providers: [provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EventHeats);
    fixture.componentRef.setInput('event', EVENT);
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    await settle();
    http.expectOne(HEATS).flush({ heats });
    http.expectOne(CATS).flush({ categories: CATEGORIES });
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
    const check = async (name: string) => {
      const box = Array.from(root.querySelectorAll('fieldset label')).find((l) => l.textContent?.trim() === name)!.querySelector('input')!;
      box.click();
      await fixture.whenStable();
    };
    const click = async (text: string, scope: ParentNode = root) => {
      Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text)!.click();
      await settle();
    };
    const rows = () => Array.from(root.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).slice(0, 4).map((td) => td.textContent?.trim()));
    return { fixture, root, control, type, check, click, rows };
  }

  afterEach(() => http.verify());

  it('programação com dia (evento de 2 dias), horário no fuso, categorias juntas e "A definir"', async () => {
    const { rows } = await setup();
    expect(rows()).toEqual([
      ['Domingo, 18/04 09:00', 'Bateria 1', 'MX1 + MX2', 'Programada'],
      ['A definir', 'Final', 'MX1', 'Programada'],
    ]);
  });

  it('o seletor de dia oferece os dias do evento', async () => {
    const { control } = await setup();
    expect(Array.from(control('Dia').options).map((o) => o.textContent)).toEqual(['Sábado, 17/04', 'Domingo, 18/04']);
  });

  it('sem categoria marcada: avisa e não envia', async () => {
    const { type, click, root } = await setup();
    await type('Nome', 'Bateria 3');
    await click('Adicionar bateria');
    expect(root.querySelector('#heat-categories-error')?.textContent).toContain('Marque ao menos uma categoria.');
    http.expectNone({ method: 'POST', url: HEATS });
  });

  it('cria: dia + horário do fuso do evento viram UTC; categorias marcadas viram a lista', async () => {
    const { type, check, click } = await setup();
    await type('Nome', 'Noturna');
    await type('Dia', '2027-04-18');
    await type('Horário', '22:00');
    await check('MX1');
    await check('MX2');
    await click('Adicionar bateria');
    const req = http.expectOne({ method: 'POST', url: HEATS });
    expect(req.request.body).toEqual({
      name: 'Noturna',
      scheduledAt: '2027-04-19T01:00:00.000Z', // domingo 22:00 em SP
      eventCategoryIds: ['ec-mx1', 'ec-mx2'],
    });
    req.flush({ ...HEAT, id: 'h9' });
    await settle();
    TestBed.tick(); // o reload() das listas dispara as novas buscas
    http.expectOne(HEATS).flush({ heats: [HEAT, UNSCHEDULED] });
    http.expectOne(CATS).flush({ categories: CATEGORIES });
  });

  it('horário em branco = a definir (scheduledAt null)', async () => {
    const { type, check, click } = await setup();
    await type('Nome', 'Superfinal');
    await check('MX1');
    await click('Adicionar bateria');
    const req = http.expectOne({ method: 'POST', url: HEATS });
    expect(req.request.body.scheduledAt).toBeNull();
    req.flush(UNSCHEDULED);
    await settle();
    TestBed.tick();
    http.expectOne(HEATS).flush({ heats: [] });
    http.expectOne(CATS).flush({ categories: CATEGORIES });
  });

  it('editar preenche dia, horário e categorias da bateria', async () => {
    const { root, control, click } = await setup();
    await click('Editar', root.querySelector('tbody tr')!);
    expect(control('Nome').value).toBe('Bateria 1');
    expect(control('Dia').value).toBe('2027-04-18');
    expect(control('Horário').value).toBe('09:00');
    const checked = Array.from(root.querySelectorAll<HTMLInputElement>('fieldset input:checked')).map((i) => i.parentElement?.textContent?.trim());
    expect(checked).toEqual(['MX1', 'MX2']);
  });

  it('bateria já iniciada não tem Editar/Remover', async () => {
    const { root } = await setup([RUNNING]);
    expect(root.querySelector('tbody tr')?.textContent).toContain('Em prova');
    expect(root.querySelectorAll('tbody button')).toHaveLength(0);
  });

  it('somente leitura: só a programação', async () => {
    const { root } = await setup([HEAT], false);
    expect(root.querySelector('form')).toBeNull();
    expect(root.querySelectorAll('tbody button')).toHaveLength(0);
  });
});
