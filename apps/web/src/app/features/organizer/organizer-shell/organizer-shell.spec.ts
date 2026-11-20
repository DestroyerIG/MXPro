import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';

describe('OrganizerShell (layout do painel)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
  });

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const root = harness.routeNativeElement as HTMLElement;
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Menu do organizador"] a'));
    return { harness, root, links };
  }

  it('mostra os 9 itens do menu na ordem do escopo', async () => {
    const { links } = await open('/painel');
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      'Painel', 'Eventos', 'Categorias', 'Inscrições', 'Cronometragem',
      'Resultados', 'Campeonato', 'Financeiro', 'Equipe',
    ]);
  });

  it('marca só o item da página atual com aria-current="page"', async () => {
    const { links } = await open('/painel');
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent?.trim())).toEqual([
      'Painel',
    ]);
  });

  it('área sem tela mostra a página provisória com o texto do item, e o menu acompanha', async () => {
    const { root, links } = await open('/painel/inscricoes');
    expect(root.querySelector('h1')?.textContent).toContain('Inscrições');
    expect(root.textContent).toContain('Esta área ainda não foi construída');
    expect(links.find((a) => a.getAttribute('aria-current') === 'page')?.textContent?.trim()).toBe('Inscrições');
  });

  it('links apontam para /painel/<área>', async () => {
    const { links } = await open('/painel');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/painel', '/painel/eventos', '/painel/categorias', '/painel/inscricoes', '/painel/cronometragem',
      '/painel/resultados', '/painel/campeonato', '/painel/financeiro', '/painel/equipe',
    ]);
  });

  it('botão Menu abre e Esc fecha a gaveta (aria-expanded acompanha)', async () => {
    const { harness, root } = await open('/painel');
    const button = root.querySelector<HTMLButtonElement>('button[aria-controls="menu-lateral"]')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');

    button.click();
    await harness.fixture.whenStable();
    expect(button.getAttribute('aria-expanded')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await harness.fixture.whenStable();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('mostra o logo da marca padrão (MX + PRO)', async () => {
    const { root } = await open('/painel');
    expect(root.querySelector('app-brand-logo')?.textContent?.replace(/\s/g, '')).toBe('MXPRO');
  });
});
