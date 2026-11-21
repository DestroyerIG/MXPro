import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RegistrationDto } from '@mxpro/shared';
import { provideTestHttp, signInAs } from '../../../core/auth/session.testing';
import { settle } from '../../organizer/events/events.testing';
import { MY_REGISTRATIONS_URL } from '../registration-api';
import { MyRegistrations } from './my-registrations';

const base: RegistrationDto = {
  id: 'r1',
  event: { id: 'e1', name: 'Copa Verão de Motocross - Etapa 2', startDate: '2027-03-13', timeZone: 'America/Sao_Paulo' },
  category: { id: 'c1', name: 'MX2' },
  raceNumber: '27',
  bike: 'Honda CRF 250F',
  team: null,
  status: 'CONFIRMED',
  entryFeeCents: 15000,
  holdExpiresAt: null,
  confirmedAt: '2027-01-20T15:00:00.000Z',
  pix: null,
  paymentReceived: true,
};

describe('MyRegistrations (/minhas-inscricoes)', () => {
  async function setup(response: { registrations: RegistrationDto[] } | null) {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestHttp()] });
    const http = TestBed.inject(HttpTestingController);
    await signInAs('PILOT');
    const fixture = TestBed.createComponent(MyRegistrations);
    fixture.detectChanges();
    await settle();
    const req = http.expectOne(MY_REGISTRATIONS_URL);
    if (response) req.flush(response);
    else req.flush({ code: 'X', message: 'x' }, { status: 500, statusText: 'Erro' });
    await settle();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('lista com situação; aguardando mostra o atalho para pagar; "pago sem vaga" tem rótulo próprio', async () => {
    const el = await setup({
      registrations: [
        base,
        { ...base, id: 'r2', category: { id: 'c2', name: 'Master 35+' }, status: 'PENDING_PAYMENT', paymentReceived: false },
        { ...base, id: 'r3', category: { id: 'c3', name: 'MX1' }, status: 'EXPIRED', paymentReceived: true },
      ],
    });
    const items = [...el.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(items[0]).toContain('13/03/2027 • MX2 • nº 27');
    expect(items[0]).toContain('Confirmada');
    expect(items[1]).toContain('Pagar R$ 150,00 com Pix');
    expect(items[2]).toContain('Pago, vaga em análise');
    expect(el.querySelector('li a')?.getAttribute('href')).toBe('/minhas-inscricoes/r1');
  });

  it('sem inscrições: orienta a usar o link do evento', async () => {
    const el = await setup({ registrations: [] });
    expect(el.textContent).toContain('Você ainda não tem inscrições.');
  });

  it('erro ao carregar: mensagem e tentar de novo', async () => {
    const el = await setup(null);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar suas inscrições.');
  });
});
