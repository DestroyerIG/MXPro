import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTestHttp, signInAs } from '../../../core/auth/session.testing';
import { LOGOUT_URL, SessionService } from '../../../core/auth/session.service';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TimingBoard } from './timing-board';

describe('TimingBoard (tela de pista)', () => {
  beforeAll(() => {
    // jsdom não implementa o <dialog> modal; basta abrir/fechar para testar a confirmação.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  async function setup() {
    // A tela tem o botão Sair: precisa do HttpClient (falso) e do roteador.
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'entrar', children: [] }]), provideTestHttp()] });
    await signInAs('TIMEKEEPER');
    const fixture = TestBed.createComponent(TimingBoard);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const stable = () => fixture.whenStable();
    const card = (n: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('app-pilot-card button')).find((b) =>
        b.getAttribute('aria-label')?.startsWith(`Número ${n},`),
      )!;
    const action = (label: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('footer button')).find((b) => b.textContent?.includes(label))!;
    const statusText = () => el.querySelector('header [role="status"]')?.textContent?.replace(/\s+/g, ' ').trim();
    const firstPass = () => el.querySelector('aside li')?.textContent?.replace(/\s+/g, ' ').trim();
    return { fixture, el, stable, card, action, statusText, firstPass };
  }

  it('abre como no PDF: 8 pilotos, relógio da bateria e OFFLINE com 14 pendentes', async () => {
    const { el, statusText } = await setup();
    expect(el.querySelectorAll('app-pilot-card')).toHaveLength(8);
    expect(el.querySelector('h1')?.textContent).toContain('BATERIA 1 • MX2');
    expect(el.querySelector('[role="timer"]')?.textContent).toMatch(/0?8:4[12]/);
    expect(statusText()).toContain('OFFLINE - 14 pendentes');
  });

  it('um toque registra a passagem: +1 volta, cartão em laranja, topo das últimas passagens, +1 pendente', async () => {
    const { card, stable, firstPass, statusText } = await setup();
    card('27').click();
    await stable();
    expect(card('27').getAttribute('aria-label')).toContain('8 voltas');
    expect(card('27').className).toContain('bg-brand-strong');
    expect(firstPass()).toMatch(/^#27\s*V8\s*1:\d{2}\.\d{3}$/); // volta plausível (~1 min)
    expect(statusText()).toContain('OFFLINE - 15 pendentes');
  });

  it('Penalidade arma o próximo toque; o piloto tocado recebe +10 s e aparece aviso com Desfazer', async () => {
    const { el, card, action, stable } = await setup();
    action('Penalidade').click();
    await stable();
    expect(el.textContent).toContain('Toque no piloto que recebe a penalidade (+10 s).');

    card('14').click();
    await stable();
    expect(card('14').textContent).toContain('+10 s');
    expect(card('14').getAttribute('aria-label')).toContain('7 voltas'); // não contou volta
    expect(TestBed.inject(ToastService).toasts()[0]).toMatchObject({
      message: 'Penalidade de +10 s aplicada ao #14',
      action: expect.objectContaining({ label: 'Desfazer' }),
    });
    expect(el.textContent).not.toContain('Toque no piloto que recebe'); // desarmou
  });

  it('Desfazer última anula a última ação sem apagar nada', async () => {
    const { card, action, stable } = await setup();
    card('88').click();
    await stable();
    action('Desfazer última').click();
    await stable();
    expect(card('88').getAttribute('aria-label')).toContain('6 voltas');
  });

  it('Desclassificar marca o cartão como DSQ', async () => {
    const { card, action, stable } = await setup();
    action('Desclassificar').click();
    await stable();
    card('31').click();
    await stable();
    expect(card('31').textContent).toContain('DSQ');
    expect(card('31').getAttribute('aria-label')).toContain('desclassificado');
  });

  it('Esc desarma a ação', async () => {
    const { el, action, stable } = await setup();
    action('Desclassificar').click();
    await stable();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await stable();
    expect(el.textContent).not.toContain('Toque no piloto que será desclassificado.');
  });

  it('BANDEIRADA muda o estado da prova e o botão fica indisponível', async () => {
    const { el, action, stable } = await setup();
    action('BANDEIRADA').click();
    await stable();
    expect(el.querySelector('[role="timer"]')?.textContent).toContain('BANDEIRADA');
    expect(action('BANDEIRADA').disabled).toBe(true);
  });

  it('toque repetido (volta abaixo da mínima) é registrado, mas avisa e marca o cartão', async () => {
    const { card, stable } = await setup();
    card('72').click(); // volta normal (~1 min)
    await stable();
    expect(card('72').textContent).not.toContain('REPETIDO?');

    card('72').click(); // segundo toque logo em seguida: volta de ~0 s
    await stable();
    expect(card('72').getAttribute('aria-label')).toContain('9 voltas'); // não descartou
    expect(card('72').textContent).toContain('REPETIDO?');
    expect(card('72').getAttribute('aria-label')).toContain('possível toque repetido');
    const toast = TestBed.inject(ToastService).toasts().at(-1)!;
    expect(toast.tone).toBe('warn');
    expect(toast.message).toMatch(/^Volta de 0:0\d\.\d no #72, abaixo da mínima \(0:45\.000\)\. Toque repetido\?$/);
  });

  it('o Desfazer do aviso de toque repetido anula só a passagem duplicada', async () => {
    const { card, stable } = await setup();
    card('19').click();
    await stable();
    card('19').click();
    await stable();
    const service = TestBed.inject(ToastService);
    service.runAction(service.toasts().at(-1)!.id);
    await stable();
    expect(card('19').getAttribute('aria-label')).toContain('7 voltas');
    expect(card('19').textContent).not.toContain('REPETIDO?');
  });

  it('ao reconectar, a fila é enviada e o aviso vira ONLINE', async () => {
    const { stable, statusText } = await setup();
    TestBed.inject(ConnectivityService).simulateOffline.set(false);
    await stable();
    expect(statusText()).toContain('SINCRONIZANDO');
    await vi.waitFor(
      async () => {
        await stable();
        expect(statusText()).toContain('ONLINE - tudo enviado');
      },
      { timeout: 5000, interval: 200 },
    );
  });

  describe('Sair', () => {
    const sair = (el: HTMLElement) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('header button')).find((b) => b.textContent?.trim() === 'Sair')!;

    it('com lançamentos pendentes, pede confirmação antes de sair', async () => {
      const { el, stable } = await setup();
      sair(el).click();
      await stable();
      const dialog = el.querySelector('dialog')!;
      expect(dialog.open).toBe(true);
      expect(dialog.textContent).toContain('14 lançamentos ainda não chegaram ao servidor');
      TestBed.inject(HttpTestingController).expectNone(LOGOUT_URL);

      Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.includes('Sair mesmo assim'))!.click();
      await stable();
      TestBed.inject(HttpTestingController).expectOne(LOGOUT_URL).flush(null);
      await vi.waitFor(() => expect(TestBed.inject(SessionService).user()).toBeNull());
    });

    it('com tudo enviado, sai direto e volta para o login', async () => {
      const { el, stable, statusText } = await setup();
      TestBed.inject(ConnectivityService).simulateOffline.set(false);
      await vi.waitFor(
        async () => {
          await stable();
          expect(statusText()).toContain('ONLINE - tudo enviado');
        },
        { timeout: 5000, interval: 200 },
      );
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      sair(el).click();
      await stable();
      expect(el.querySelector('dialog')!.open).toBe(false);
      TestBed.inject(HttpTestingController).expectOne(LOGOUT_URL).flush(null);
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/entrar'));
    });
  });
});
