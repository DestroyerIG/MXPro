import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

describe('Rotas do app', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('redireciona a raiz para /painel', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/painel');
    expect(harness.routeNativeElement?.querySelector('app-event-dashboard')).not.toBeNull();
  });

  it.each([
    ['/cronometragem', 'BATERIA 1 • MX2'],
    ['/ao-vivo', 'MX2 - Bateria 1'],
  ])('carrega a área %s sob demanda', async (url, heading) => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    expect(harness.routeNativeElement?.textContent).toContain(heading);
  });

  it('mostra a página 404 em endereço desconhecido', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/nao-existe');
    expect(harness.routeNativeElement?.textContent).toContain('Página não encontrada');
  });
});
