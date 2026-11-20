import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { LiveBoard, PAGE_ROTATION_MS, ROWS_PER_PAGE } from './live-board';

describe('LiveBoard (telão)', () => {
  async function setup({ fakeTimers = false } = {}) {
    const fixture = TestBed.createComponent(LiveBoard);
    // Com relógio falso, whenStable() esperaria timers que não andam: só desenha uma vez.
    if (fakeTimers) fixture.detectChanges();
    else await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const rows = () =>
      Array.from(el.querySelectorAll('tbody tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim()),
      );
    const stable = async () => (fakeTimers ? fixture.detectChanges() : await fixture.whenStable());
    return { fixture, el, rows, stable };
  }

  afterEach(() => vi.useRealTimers());

  it('cabeçalho como no PDF: AO VIVO • MX2 - Bateria 1 e Volta 7/10', async () => {
    const { el } = await setup();
    expect(el.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('AO VIVO • MX2 - Bateria 1');
    expect(el.querySelector('header p')?.textContent?.trim()).toBe('Volta 7/10');
  });

  it('colunas POS, Nº, PILOTO, VOLTAS, MELHOR, DIF. e líder com "-" em destaque', async () => {
    const { el, rows } = await setup();
    expect(Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual([
      'POS', 'Nº', 'PILOTO', 'VOLTAS', 'MELHOR', 'DIF.',
    ]);
    const [leader] = rows();
    expect(leader[0]).toBe('1');
    expect(leader[5]).toBe('-');
    expect(leader[4]).toMatch(/^1:\d{2}\.\d{3}$/);
    expect(el.querySelector('tbody tr')?.className).toContain('bg-live-leader');
  });

  it(`mostra no máximo ${ROWS_PER_PAGE} linhas e roda as páginas sozinho`, async () => {
    vi.useFakeTimers();
    const { el, rows, stable } = await setup({ fakeTimers: true });
    expect(rows()).toHaveLength(ROWS_PER_PAGE);
    expect(el.querySelector('footer')?.textContent).toContain('1/2');

    vi.advanceTimersByTime(PAGE_ROTATION_MS);
    await stable();
    expect(rows()[0][0]).toBe('11');
    expect(el.querySelector('footer')?.textContent).toContain('2/2');
  });

  it('sem patrocinadores configurados, mostra o espaço reservado', async () => {
    const { el } = await setup();
    expect(el.querySelector('footer')?.textContent).toContain('Patrocinadores: espaço para logos do evento');
  });

  it('sem conexão, mantém a classificação e avisa que está desatualizada', async () => {
    const { el, rows, stable } = await setup();
    TestBed.inject(ConnectivityService).simulateOffline.set(true);
    await stable();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Sem conexão');
    expect(rows().length).toBeGreaterThan(0);
    TestBed.inject(ConnectivityService).simulateOffline.set(false);
  });

  it('nada de dados pessoais além de nº, nome e equipe', async () => {
    const { el } = await setup();
    expect(el.textContent).not.toMatch(/@|CPF|\(\d{2}\)/);
  });
});
