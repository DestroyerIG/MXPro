import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CategoryDto, Role } from '@mxpro/shared';
import { provideTestHttp, signInAs } from '../../../core/auth/session.testing';
import { CATEGORIES_URL } from '../events/events-api';
import { settle } from '../events/events.testing';
import { CategoriesPage } from './categories-page';

const MX1: CategoryDto = { id: 'c-mx1', name: 'MX1', description: 'Motos acima de 250cc', active: true, eventCount: 2 };
const OLD: CategoryDto = { id: 'c-old', name: 'Veterano', description: null, active: false, eventCount: 0 };

describe('CategoriesPage (/painel/categorias)', () => {
  let http: HttpTestingController;

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  async function setup(role: Role = 'ORGANIZER') {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
    await signInAs(role);
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    await settle();
    http.expectOne(CATEGORIES_URL).flush({ categories: [MX1, OLD] });
    await settle();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const nameInput = () => root.querySelector<HTMLInputElement>('form input[type="text"]')!;
    const typeName = async (value: string) => {
      nameInput().value = value;
      nameInput().dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const button = (text: string, scope: ParentNode = root) =>
      Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text);
    const row = (name: string) => Array.from(root.querySelectorAll('tbody tr')).find((tr) => tr.querySelector('td')?.textContent?.trim() === name)!;
    const nameError = () => root.querySelector('ui-form-field p.text-danger-text')?.textContent?.trim() ?? null;
    const reload = async (list: CategoryDto[]) => {
      await settle();
      TestBed.tick();
      http.expectOne(CATEGORIES_URL).flush({ categories: list });
      await settle();
      await fixture.whenStable();
    };
    return { fixture, root, typeName, button, row, nameError, reload };
  }

  afterEach(() => http.verify());

  it('lista com uso e situação; rodapé com totais', async () => {
    const { row, root } = await setup();
    expect(row('MX1').textContent).toContain('2 eventos');
    expect(row('MX1').textContent).toContain('Ativa');
    expect(row('Veterano').textContent).toContain('Desativada');
    expect(root.textContent).toContain('2 categorias • 1 ativa');
  });

  it('só oferece "Excluir" para categoria nunca usada', async () => {
    const { row, button } = await setup();
    expect(button('Excluir', row('MX1'))).toBeUndefined();
    expect(button('Excluir', row('Veterano'))).toBeDefined();
  });

  it('cria categoria', async () => {
    const { typeName, button, fixture, reload } = await setup();
    await typeName('Master 45+');
    button('Criar categoria')!.click();
    await settle();
    const req = http.expectOne({ method: 'POST', url: CATEGORIES_URL });
    expect(req.request.body).toEqual({ name: 'Master 45+', description: null });
    req.flush({ id: 'c-45', name: 'Master 45+', description: null, active: true, eventCount: 0 });
    await reload([MX1, OLD]);
    expect(fixture.nativeElement.querySelector('form input').value).toBe('');
  });

  it('nome repetido: erro no campo, que some assim que o nome muda', async () => {
    const { typeName, button, nameError, fixture } = await setup();
    await typeName('mx1');
    button('Criar categoria')!.click();
    await settle();
    http.expectOne({ method: 'POST', url: CATEGORIES_URL }).flush(
      { code: 'CATEGORY_EXISTS', message: 'Já existe uma categoria com esse nome.', details: [{ field: 'name', message: 'Já existe uma categoria com esse nome.' }] },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    await fixture.whenStable();
    expect(nameError()).toBe('Já existe uma categoria com esse nome.');
    await typeName('MX1 Pró');
    expect(nameError()).toBeNull();
  });

  it('desativar envia active=false', async () => {
    const { row, button, reload } = await setup();
    button('Desativar', row('MX1'))!.click();
    await settle();
    const req = http.expectOne({ method: 'PATCH', url: `${CATEGORIES_URL}/c-mx1` });
    expect(req.request.body).toEqual({ active: false });
    req.flush({ ...MX1, active: false });
    await reload([{ ...MX1, active: false }, OLD]);
  });

  it('excluir pede confirmação antes de chamar a API', async () => {
    const { root, row, button, fixture, reload } = await setup();
    button('Excluir', row('Veterano'))!.click();
    await fixture.whenStable();
    http.expectNone({ method: 'DELETE' });
    const dialog = Array.from(root.querySelectorAll('dialog')).find((d) => d.open)!;
    expect(dialog.querySelector('h2')?.textContent).toBe('Excluir a categoria Veterano?');
    button('Excluir categoria', dialog)!.click();
    await settle();
    http.expectOne({ method: 'DELETE', url: `${CATEGORIES_URL}/c-old` }).flush(null, { status: 204, statusText: 'No Content' });
    await reload([MX1]);
  });

  it('secretaria: só consulta (sem formulário nem ações)', async () => {
    const { root } = await setup('SECRETARY');
    // O diálogo de confirmação (fechado) também tem um <form method=dialog>: fica de fora.
    expect(root.querySelector('form:not([method=dialog])')).toBeNull();
    expect(root.querySelectorAll('tbody button')).toHaveLength(0);
  });
});
