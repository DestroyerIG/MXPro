import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { LOGIN_URL, ME_URL } from '../../../core/auth/session.service';
import { provideTestHttp, sessionResponse } from '../../../core/auth/session.testing';

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('LoginPage (/entrar)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
  });

  /** Abre a tela como visitante (a API responde 401 no /me). */
  async function open(url = '/entrar') {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl(url);
    await settle(); // o router consulta o guard um tique depois
    http.expectOne(ME_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    await navigation;
    const root = harness.routeNativeElement as HTMLElement;
    const email = root.querySelector<HTMLInputElement>('input[type="email"]')!;
    const password = root.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
    const type = async (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await harness.fixture.whenStable();
    };
    const send = async () => {
      root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await harness.fixture.whenStable();
    };
    return { harness, root, email, password, type, send };
  }

  const errorsOf = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('ui-form-field p.text-danger-text')).map((p) => p.textContent?.trim());

  it('rótulos visíveis e campos com autocomplete certo (gerenciador de senhas preenche)', async () => {
    const { root, email, password } = await open();
    expect(Array.from(root.querySelectorAll('label')).map((l) => l.textContent?.replace(/[*\s]+$/g, '').trim())).toEqual([
      'E-mail',
      'Senha',
    ]);
    expect(email.getAttribute('autocomplete')).toBe('username');
    expect(password.type).toBe('password');
  });

  it('enviar vazio mostra os erros em português e NÃO chama a API', async () => {
    const { root, send } = await open();
    await send();
    expect(errorsOf(root)).toEqual(['Informe o e-mail.', 'Informe a senha.']);
    http.expectNone(LOGIN_URL);
  });

  it('e-mail em formato inválido', async () => {
    const { root, email, password, type, send } = await open();
    await type(email, 'marina');
    await type(password, 'qualquer');
    await send();
    expect(errorsOf(root)).toEqual(['Informe um e-mail válido.']);
  });

  it('login certo: entra e vai para a área do perfil', async () => {
    const { harness, email, password, type, send } = await open();
    await type(email, 'cronometrista@mxpro.test');
    await type(password, 'senha-de-teste');
    await send();
    const req = http.expectOne(LOGIN_URL);
    expect(req.request.body).toEqual({ email: 'cronometrista@mxpro.test', password: 'senha-de-teste' });
    req.flush(sessionResponse('TIMEKEEPER'));
    await settle();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/cronometragem');
  });

  it('volta para a página que a pessoa tentou abrir (?voltar=)', async () => {
    const { harness, email, password, type, send } = await open('/entrar?voltar=%2Fpainel%2Finscricoes');
    await type(email, 'organizador@mxpro.test');
    await type(password, 'senha-de-teste');
    await send();
    http.expectOne(LOGIN_URL).flush(sessionResponse('ORGANIZER'));
    await settle();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/painel/inscricoes');
  });

  it('?voltar= apontando para outro site é ignorado (vai para a área do perfil)', async () => {
    const { harness, email, password, type, send } = await open('/entrar?voltar=https%3A%2F%2Fsite-falso.com');
    await type(email, 'organizador@mxpro.test');
    await type(password, 'senha-de-teste');
    await send();
    http.expectOne(LOGIN_URL).flush(sessionResponse('ORGANIZER'));
    await settle();
    await settle();
    expect(TestBed.inject(Router).url).toBe('/painel');
    // O painel já pediu a lista de eventos: responde para a tela poder estabilizar.
    http.match('/api/events').forEach((r) => r.flush({ events: [] }));
    await harness.fixture.whenStable();
  });

  it('senha errada: mostra a mensagem da API, limpa a senha e mantém o e-mail', async () => {
    const { harness, root, email, password, type, send } = await open();
    await type(email, 'organizador@mxpro.test');
    await type(password, 'errada');
    await send();
    http
      .expectOne(LOGIN_URL)
      .flush({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' }, { status: 401, statusText: 'Unauthorized' });
    await settle();
    await harness.fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent?.trim()).toBe('E-mail ou senha incorretos.');
    expect(password.value).toBe('');
    expect(email.value).toBe('organizador@mxpro.test');
    expect(errorsOf(root)).toEqual([]); // sem um segundo erro "Informe a senha."
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('sem conexão com o servidor: mensagem clara', async () => {
    const { harness, root, email, password, type, send } = await open();
    await type(email, 'organizador@mxpro.test');
    await type(password, 'x');
    await send();
    http.expectOne(LOGIN_URL).error(new ProgressEvent('error'));
    await settle();
    await harness.fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Sem conexão com o servidor');
  });

  it('botão Mostrar revela a senha (útil no celular, com luva)', async () => {
    const { harness, root, password } = await open();
    const toggle = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Mostrar')!;
    toggle.click();
    await harness.fixture.whenStable();
    expect(password.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});
