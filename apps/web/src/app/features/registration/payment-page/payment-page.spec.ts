import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RegistrationDto } from '@mxpro/shared';
import { provideTestHttp, signInAs } from '../../../core/auth/session.testing';
import { settle } from '../../organizer/events/events.testing';
import { registrationUrl } from '../registration-api';
import { PAYMENT_POLL_MS, PaymentPage } from './payment-page';

const ID = 'reg-1';
const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

function registration(patch: Partial<RegistrationDto> = {}): RegistrationDto {
  return {
    id: ID,
    event: { id: 'ev-1', name: 'Copa Verão de Motocross - Etapa 2', startDate: '2027-03-13', timeZone: 'America/Sao_Paulo' },
    category: { id: 'ec-mx2', name: 'MX2' },
    raceNumber: '27',
    bike: 'Honda CRF 250F',
    team: 'Equipe Exemplo',
    status: 'PENDING_PAYMENT',
    entryFeeCents: 15000,
    holdExpiresAt: inMinutes(28),
    confirmedAt: null,
    pix: { paymentId: 'pay-1', status: 'PENDING', amountCents: 15000, pixCopyPaste: '00020126580014br.gov.bcb.pix0136chave', expiresAt: inMinutes(28) },
    paymentReceived: false,
    ...patch,
  };
}

describe('PaymentPage (/minhas-inscricoes/:id)', () => {
  let http: HttpTestingController;
  let el: HTMLElement;

  afterEach(() => {
    vi.useRealTimers();
  });

  async function setup(reg: RegistrationDto | null) {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
    await signInAs('PILOT');
    const fixture = TestBed.createComponent(PaymentPage);
    fixture.componentRef.setInput('id', ID);
    fixture.detectChanges();
    await settle();
    const req = http.expectOne(registrationUrl(ID));
    if (reg) req.flush(reg);
    else req.flush({ code: 'REGISTRATION_NOT_FOUND', message: 'Inscrição não encontrada.' }, { status: 404, statusText: 'Not Found' });
    await settle();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
    return fixture;
  }
  const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

  it('aguardando: QR Code, copiar código e "Aguardando pagamento…" com o prazo; resumo da inscrição', async () => {
    await setup(registration());
    expect(el.querySelector('app-pix-qr path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Aguardando pagamento…');
    expect(el.textContent).toMatch(/R\$\s150,00 • Pix válido até \d{2}:\d{2}/);
    expect(el.textContent).toMatch(/faltam 2\d:\d{2}/);
    expect(el.textContent).toContain('Nº de largada');
    expect(el.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('00020126580014br.gov.bcb.pix0136chave');
  });

  it('copiar código Pix usa a área de transferência', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = await setup(registration());
    button('Copiar código Pix')!.click();
    await settle();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('00020126580014br.gov.bcb.pix0136chave');
    expect(button('Código copiado')).toBeTruthy();
  });

  it('pergunta de tempos em tempos e muda sozinha para "Inscrição confirmada!"', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fixture = await setup(registration());
    vi.advanceTimersByTime(PAYMENT_POLL_MS - 1000);
    TestBed.tick();
    http.expectNone(registrationUrl(ID));
    vi.advanceTimersByTime(1000);
    TestBed.tick();
    http.expectOne(registrationUrl(ID)).flush(registration({ status: 'CONFIRMED', pix: null, holdExpiresAt: null, paymentReceived: true }));
    await settle();
    await fixture.whenStable();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Inscrição confirmada!');
    // Confirmada: para de perguntar.
    vi.advanceTimersByTime(PAYMENT_POLL_MS * 2);
    TestBed.tick();
    http.expectNone(registrationUrl(ID));
  });

  it('prazo vencido: "Gerar novo Pix" pede outro e mostra o QR novo', async () => {
    const fixture = await setup(registration({ status: 'EXPIRED', pix: null, holdExpiresAt: null }));
    expect(el.textContent).toContain('O prazo para pagar terminou.');
    button('Gerar novo Pix')!.click();
    await settle();
    const req = http.expectOne(`${registrationUrl(ID)}/pix`);
    expect(req.request.method).toBe('POST');
    req.flush({ registration: registration(), pixError: null });
    await settle();
    await fixture.whenStable();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Aguardando pagamento…');
  });

  it('novo Pix recusado (número ocupado): explica e oferece nova inscrição', async () => {
    const fixture = await setup(registration({ status: 'EXPIRED', pix: null, holdExpiresAt: null }));
    button('Gerar novo Pix')!.click();
    await settle();
    http.expectOne(`${registrationUrl(ID)}/pix`).flush(
      { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', details: [{ field: 'raceNumber', message: 'O número 27 já está em uso nesta categoria. Escolha outro.' }] },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();
    TestBed.tick();
    http.expectOne(registrationUrl(ID)).flush(registration({ status: 'EXPIRED', pix: null, holdExpiresAt: null }));
    await settle();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('O número 27 já está em uso');
    expect(el.querySelector('[role="alert"] a')?.getAttribute('href')).toBe('/inscricao/ev-1');
  });

  it('"pago sem vaga": avisa que o Pix foi recebido e NÃO oferece pagar de novo', async () => {
    await setup(registration({ status: 'EXPIRED', pix: null, holdExpiresAt: null, paymentReceived: true }));
    expect(el.textContent).toContain('Recebemos o seu Pix.');
    expect(el.textContent).toContain('Não pague de novo.');
    expect(button('Gerar novo Pix')).toBeUndefined();
    expect(el.textContent).toContain('Pagamento recebido, vaga em análise');
  });

  it('inscrição de outra pessoa ou inexistente: não encontrada', async () => {
    await setup(null);
    expect(el.textContent).toContain('Inscrição não encontrada.');
  });
});
