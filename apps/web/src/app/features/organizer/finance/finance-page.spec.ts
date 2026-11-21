import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MercadoPagoConnectionDto, Role } from '@mxpro/shared';
import { provideTestHttp, signInAs } from '../../../core/auth/session.testing';
import { settle } from '../events/events.testing';
import { FinancePage } from './finance-page';
import { EXTERNAL_NAVIGATION, MERCADO_PAGO_URL } from './payments-api';

const CONNECTED: MercadoPagoConnectionDto = {
  configured: true,
  account: {
    mpUserId: '241983636',
    liveMode: true,
    connectedAt: '2026-11-21T13:00:00.000Z',
    connectedBy: { id: 'u1', name: 'Marina Duarte' },
    expiresAt: '2027-05-20T13:00:00.000Z',
  },
};

describe('FinancePage (conta do Mercado Pago)', () => {
  let http: HttpTestingController;
  let el: HTMLElement;
  const navigate = vi.fn();

  beforeAll(() => {
    // jsdom não implementa o <dialog> modal.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  async function setup(connection: MercadoPagoConnectionDto | null, { role = 'ORGANIZER' as Role, result = undefined as string | undefined } = {}) {
    navigate.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideTestHttp(), { provide: EXTERNAL_NAVIGATION, useValue: navigate }],
    });
    http = TestBed.inject(HttpTestingController);
    await signInAs(role);
    const fixture = TestBed.createComponent(FinancePage);
    if (result) fixture.componentRef.setInput('mercadopago', result);
    fixture.detectChanges();
    await settle();
    if (connection) http.expectOne(MERCADO_PAGO_URL).flush(connection);
    await settle();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
    return fixture;
  }
  const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

  it('sem credenciais no servidor: explica o que configurar, sem botão de conectar', async () => {
    await setup({ configured: false, account: null });
    expect(el.textContent).toContain('MP_CLIENT_ID');
    expect(button('Conectar Mercado Pago')).toBeUndefined();
  });

  it('conectar: pede a URL à API e leva ao Mercado Pago', async () => {
    const fixture = await setup({ configured: true, account: null });
    button('Conectar Mercado Pago')!.click();
    await settle();
    const req = http.expectOne(`${MERCADO_PAGO_URL}/connect`);
    expect(req.request.method).toBe('POST');
    req.flush({ authorizationUrl: 'https://auth.mercadopago.com/authorization?client_id=1' });
    await settle();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('https://auth.mercadopago.com/authorization?client_id=1');
  });

  it('erro ao iniciar a conexão aparece na tela e o botão volta a funcionar', async () => {
    const fixture = await setup({ configured: true, account: null });
    button('Conectar Mercado Pago')!.click();
    await settle();
    http
      .expectOne(`${MERCADO_PAGO_URL}/connect`)
      .flush({ code: 'MP_NOT_CONFIGURED', message: 'Integração não configurada.' }, { status: 409, statusText: 'Conflict' });
    await settle();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Integração não configurada.');
    expect(button('Conectar Mercado Pago')!.disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('conectada: mostra a conta, quem conectou e a validade; nenhum token aparece', async () => {
    await setup(CONNECTED);
    expect(el.textContent).toContain('Conectada');
    expect(el.textContent).toContain('241983636');
    expect(el.textContent).toContain('por Marina Duarte');
    expect(el.textContent).not.toContain('Conta de teste');
  });

  it('conta de teste (sandbox) é sinalizada', async () => {
    await setup({ ...CONNECTED, account: { ...CONNECTED.account!, liveMode: false } });
    expect(el.textContent).toContain('Conta de teste');
  });

  it('desconectar pede confirmação e recarrega', async () => {
    const fixture = await setup(CONNECTED);
    button('Desconectar')!.click();
    await fixture.whenStable();
    const dialog = el.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Desconectar')!.click();
    await settle();
    const req = http.expectOne(MERCADO_PAGO_URL);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await settle();
    TestBed.tick();
    http.expectOne(MERCADO_PAGO_URL).flush({ configured: true, account: null });
    await settle();
    await fixture.whenStable();
    expect(button('Conectar Mercado Pago')).toBeTruthy();
  });

  it('volta do Mercado Pago com o resultado na URL: mostra a mensagem certa', async () => {
    await setup(CONNECTED, { result: 'conectado' });
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Conta do Mercado Pago conectada');
  });

  it('resultado desconhecido na URL é ignorado', async () => {
    await setup(CONNECTED, { result: '<script>' });
    expect(el.querySelector('p[role="status"]')).toBeNull();
  });

  it('secretaria: aviso, sem buscar a conta', async () => {
    await setup(null, { role: 'SECRETARY' });
    http.expectNone(MERCADO_PAGO_URL);
    expect(el.textContent).toContain('Só o organizador');
  });
});
