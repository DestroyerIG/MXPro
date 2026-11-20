import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Role } from '@mxpro/shared';
import { routes } from './app.routes';
import { ME_URL } from './core/auth/session.service';
import { provideTestHttp, signInAs } from './core/auth/session.testing';

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('Rotas do app', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), provideTestHttp()] });
  });

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return { harness, url: TestBed.inject(Router).url, root: harness.fixture.nativeElement as HTMLElement };
  }

  it.each<[Role, string, string]>([
    ['ORGANIZER', '/painel', 'app-event-dashboard'],
    ['SECRETARY', '/painel', 'app-event-dashboard'],
    ['TIMEKEEPER', '/cronometragem', 'app-timing-board'],
    ['PILOT', '/ao-vivo/telao', 'app-live-board'],
  ])('raiz (/) leva %s para a área dele (%s)', async (role, expected, selector) => {
    await signInAs(role);
    const { url, root } = await open('/');
    expect(url).toBe(expected);
    expect(root.querySelector(selector)).not.toBeNull();
  });

  it('sem login, a raiz abre a tela de login', async () => {
    const navigation = open('/');
    await settle(); // o router consulta o guard um tique depois
    TestBed.inject(HttpTestingController).expectOne(ME_URL).flush({ code: 'UNAUTHENTICATED', message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    const { url, root } = await navigation;
    expect(url).toBe('/entrar');
    expect(root.querySelector('h1')?.textContent).toContain('Entrar');
  });

  it('sem login, área protegida manda ao login guardando o endereço para voltar', async () => {
    const navigation = open('/painel/inscricoes');
    await settle(); // o router consulta o guard um tique depois
    TestBed.inject(HttpTestingController).expectOne(ME_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    expect((await navigation).url).toBe('/entrar?voltar=%2Fpainel%2Finscricoes');
  });

  it('perfil sem acesso à área é levado para a área dele (cronometrista em /painel)', async () => {
    await signInAs('TIMEKEEPER');
    expect((await open('/painel')).url).toBe('/cronometragem');
  });

  it('secretaria não abre a cronometragem', async () => {
    await signInAs('SECRETARY');
    expect((await open('/cronometragem')).url).toBe('/painel');
  });

  it('quem já está logado e abre /entrar vai direto para a sua área', async () => {
    await signInAs('ORGANIZER');
    expect((await open('/entrar')).url).toBe('/painel');
  });

  it.each([
    ['/cronometragem', 'BATERIA 1 • MX2', 'TIMEKEEPER'],
    ['/ao-vivo', 'MX2 - Bateria 1', null],
  ] as const)('carrega a área %s sob demanda', async (url, heading, role) => {
    if (role) await signInAs(role);
    expect((await open(url)).root.textContent).toContain(heading);
  });

  it('páginas públicas (ao vivo) abrem sem consultar a sessão', async () => {
    await open('/ao-vivo');
    TestBed.inject(HttpTestingController).expectNone(ME_URL);
  });

  it('mostra a página 404 em endereço desconhecido', async () => {
    expect((await open('/nao-existe')).root.textContent).toContain('Página não encontrada');
  });
});
