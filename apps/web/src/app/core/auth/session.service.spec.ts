import { HttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LOGIN_URL, LOGOUT_URL, ME_URL, SessionService, isSafeReturnUrl } from './session.service';
import { TEST_USERS, provideTestHttp, sessionResponse } from './session.testing';

const CACHE_KEY = 'mxpro.session-user';
const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };
/** Deixa terminar o que roda em segundo plano (promessas já resolvidas). */
const settle = () => new Promise((resolve) => setTimeout(resolve));
const OFFLINE = new ProgressEvent('error'); // como o HttpClient representa "sem rede" (status 0)

describe('SessionService', () => {
  let http: HttpTestingController;
  let session: SessionService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), provideTestHttp()],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
  });
  afterEach(() => http.verify());

  const create = () => (session = TestBed.inject(SessionService));

  describe('restore (quem está logado?)', () => {
    it('pergunta à API e guarda o usuário (também no aparelho, para abrir offline)', async () => {
      create();
      const restoring = session.restore();
      http.expectOne(ME_URL).flush(sessionResponse('ORGANIZER'));
      expect(await restoring).toEqual(TEST_USERS.ORGANIZER);
      expect(session.user()).toEqual(TEST_USERS.ORGANIZER);
      expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toEqual(TEST_USERS.ORGANIZER);
    });

    it('401: ninguém logado (sem redirecionar: quem decide é o guard)', async () => {
      create();
      const restoring = session.restore();
      http.expectOne(ME_URL).flush(null, UNAUTHORIZED);
      expect(await restoring).toBeNull();
      expect(session.isAuthenticated()).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('várias chamadas na mesma abertura geram UMA consulta à API', async () => {
      create();
      const both = Promise.all([session.restore(), session.restore()]);
      http.expectOne(ME_URL).flush(sessionResponse('TIMEKEEPER'));
      expect(await both).toEqual([TEST_USERS.TIMEKEEPER, TEST_USERS.TIMEKEEPER]);
      expect(await session.restore()).toEqual(TEST_USERS.TIMEKEEPER);
    });

    it('com usuário guardado: abre NA HORA, sem esperar a rede, e confirma em segundo plano', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(TEST_USERS.TIMEKEEPER));
      create();
      expect(await session.restore()).toEqual(TEST_USERS.TIMEKEEPER); // antes de a API responder
      http.expectOne(ME_URL).flush(sessionResponse('TIMEKEEPER'));
      expect(session.user()).toEqual(TEST_USERS.TIMEKEEPER);
    });

    it('com usuário guardado e SEM internet: continua logado (a cronometragem abre offline)', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(TEST_USERS.TIMEKEEPER));
      create();
      await session.restore();
      http.expectOne(ME_URL).error(OFFLINE);
      await settle();
      expect(session.user()).toEqual(TEST_USERS.TIMEKEEPER);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('com usuário guardado, mas a API diz 401: esquece e leva ao login', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(TEST_USERS.ORGANIZER));
      create();
      await session.restore();
      http.expectOne(ME_URL).flush(null, UNAUTHORIZED);
      await settle();
      expect(session.user()).toBeNull();
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/entrar'], expect.anything());
    });

    it('sem usuário guardado e sem internet: ninguém logado', async () => {
      create();
      const restoring = session.restore();
      http.expectOne(ME_URL).error(OFFLINE);
      expect(await restoring).toBeNull();
    });
  });

  it('login: envia e-mail e senha e passa a ter o usuário', async () => {
    create();
    const logging = session.login({ email: 'organizador@mxpro.test', password: 'segredo' });
    const req = http.expectOne(LOGIN_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'organizador@mxpro.test', password: 'segredo' });
    req.flush(sessionResponse('ORGANIZER'));
    expect(await logging).toEqual(TEST_USERS.ORGANIZER);
    expect(await session.restore()).toEqual(TEST_USERS.ORGANIZER); // sem nova consulta
  });

  it('login com senha errada: rejeita com o erro da API e continua sem usuário', async () => {
    create();
    const logging = session.login({ email: 'x@mxpro.test', password: 'errada' });
    http.expectOne(LOGIN_URL).flush({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' }, UNAUTHORIZED);
    await expect(logging).rejects.toMatchObject({ status: 401 });
    expect(session.user()).toBeNull();
    expect(navigate).not.toHaveBeenCalled(); // o interceptor não trata o 401 do login
  });

  it('logout sem internet ainda sai deste aparelho', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(TEST_USERS.ORGANIZER));
    create();
    await session.restore();
    http.expectOne(ME_URL).flush(sessionResponse('ORGANIZER'));
    const leaving = session.logout();
    http.expectOne(LOGOUT_URL).error(OFFLINE);
    await leaving;
    expect(session.user()).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});

describe('authInterceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }]), provideTestHttp()] });
  });

  it('401 em qualquer chamada da API: sessão expirou → esquece o usuário e vai ao login', async () => {
    const http = TestBed.inject(HttpTestingController);
    const session = TestBed.inject(SessionService);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const restoring = session.restore();
    http.expectOne(ME_URL).flush(sessionResponse('ORGANIZER'));
    await restoring;

    const call = firstValueFrom(TestBed.inject(HttpClient).get('/api/users'));
    http.expectOne('/api/users').flush(null, UNAUTHORIZED);
    await expect(call).rejects.toBeTruthy(); // o erro continua chegando a quem chamou

    expect(session.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/entrar'], expect.anything());
  });

  it('403 (perfil sem permissão) NÃO desloga', async () => {
    const http = TestBed.inject(HttpTestingController);
    const session = TestBed.inject(SessionService);
    const restoring = session.restore();
    http.expectOne(ME_URL).flush(sessionResponse('TIMEKEEPER'));
    await restoring;

    const call = firstValueFrom(TestBed.inject(HttpClient).get('/api/users'));
    http.expectOne('/api/users').flush(null, { status: 403, statusText: 'Forbidden' });
    await expect(call).rejects.toBeTruthy();
    expect(session.user()).toEqual(TEST_USERS.TIMEKEEPER);
  });
});

describe('isSafeReturnUrl (evita redirecionar para fora do site)', () => {
  it.each([
    ['/painel/inscricoes', true],
    ['/cronometragem?bateria=1', true],
    ['https://site-falso.com', false],
    ['//site-falso.com', false],
    ['/\\site-falso.com', false],
    ['javascript:alert(1)', false],
    ['/entrar', false],
    ['', false],
    [undefined, false],
  ])('%s → %s', (url, expected) => {
    expect(isSafeReturnUrl(url)).toBe(expected);
  });
});
