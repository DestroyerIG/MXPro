import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { PublicEventDto, RegistrationDto, Role } from '@mxpro/shared';
import { ME_URL } from '../../../core/auth/session.service';
import { TEST_USERS, provideTestHttp, sessionResponse, signInAs } from '../../../core/auth/session.testing';
import { settle } from '../../organizer/events/events.testing';
import { publicEventUrl } from '../registration-api';
import { RegistrationPage } from './registration-page';

@Component({ template: '' })
class Blank {}

const EVENT_ID = '019a8f00-0000-7000-8000-000000000102';
const MX2 = '019a8f00-0000-7000-8000-000000000302';
const MX1 = '019a8f00-0000-7000-8000-000000000301';

const EVENT: PublicEventDto = {
  id: EVENT_ID,
  name: 'Copa Verão de Motocross - Etapa 2',
  startDate: '2027-03-13',
  endDate: '2027-03-13',
  timeZone: 'America/Sao_Paulo',
  venue: 'Pista Terra Vermelha',
  city: 'Campo Largo',
  state: 'PR',
  registration: { isOpen: true, opensAt: '2026-11-01T12:00:00.000Z', closesAt: '2027-03-11T02:59:00.000Z' },
  categories: [
    { id: MX1, name: 'MX1', description: null, modality: 'MOTOCROSS', entryFeeCents: 15000, spotsLeft: 0 },
    { id: MX2, name: 'MX2', description: 'Motos até 250cc', modality: 'MOTOCROSS', entryFeeCents: 15000, spotsLeft: 3 },
  ],
};

const CREATED = { registration: { id: 'reg-1' } as RegistrationDto, pixError: null };

describe('RegistrationPage (/inscricao/:eventId)', () => {
  let http: HttpTestingController;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function setup({ role = null as Role | null, event = EVENT as PublicEventDto | null } = {}) {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Blank }]), provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
    if (role) await signInAs(role);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RegistrationPage);
    fixture.componentRef.setInput('eventId', EVENT_ID);
    fixture.detectChanges();
    await settle();
    const req = http.expectOne(publicEventUrl(EVENT_ID));
    if (event) req.flush(event);
    else req.flush({ code: 'EVENT_NOT_FOUND', message: 'x' }, { status: 404, statusText: 'Not Found' });
    await settle();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
    return fixture;
  }

  const field = (label: string) => {
    const f = [...el.querySelectorAll('ui-form-field')].find((x) => x.querySelector('label')?.textContent?.trim().startsWith(label));
    return f!.querySelector('input, select') as HTMLInputElement & HTMLSelectElement;
  };
  const type = (label: string, value: string) => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const check = (text: string) =>
    [...el.querySelectorAll('label')].find((l) => l.textContent?.includes(text))!.querySelector('input')!.click();
  const submitButton = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Continuar para pagamento'))!;

  function fillRegistration() {
    type('Categoria', MX2);
    type('Nº de largada', '27');
    type('Moto', 'Honda CRF 250F');
    type('Equipe', 'Equipe Exemplo');
    check('termo de responsabilidade');
  }

  it('mostra o evento e as categorias com valor; categoria esgotada fica indisponível', async () => {
    await setup();
    expect(el.querySelector('h1')?.textContent).toContain('Copa Verão de Motocross - Etapa 2 - Inscrição');
    expect(el.textContent).toContain('Pista Terra Vermelha, Campo Largo/PR');
    const options = [...field('Categoria').querySelectorAll('option')];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Escolha…', 'MX1 - R$ 150,00 (esgotada)', 'MX2 - R$ 150,00']);
    expect(options[1]!.disabled).toBe(true);
  });

  it('sem conta: cria a conta junto, abre a sessão e segue para o pagamento', async () => {
    const fixture = await setup();
    type('Nome completo', 'Rafael Menezes');
    type('E-mail', 'Rafael@MXPro.test ');
    type('Crie uma senha', 'senha-forte-1');
    check('política de privacidade');
    fillRegistration();
    fixture.detectChanges();
    expect(el.textContent).toContain('Restam 3 vagas nesta categoria.');
    submitButton().click();
    await settle();
    const req = http.expectOne(`${publicEventUrl(EVENT_ID)}/registrations`);
    expect(req.request.body).toEqual({
      eventCategoryId: MX2,
      raceNumber: '27',
      bike: 'Honda CRF 250F',
      team: 'Equipe Exemplo',
      acceptWaiver: true,
      account: { name: 'Rafael Menezes', email: 'Rafael@MXPro.test', password: 'senha-forte-1', acceptPrivacy: true },
    });
    req.flush(CREATED, { status: 201, statusText: 'Created' });
    await settle();
    // A API abriu a sessão (cookie): o app pergunta quem entrou.
    http.expectOne(ME_URL).flush(sessionResponse('PILOT'));
    await settle();
    expect(navigate).toHaveBeenCalledWith(['/minhas-inscricoes', 'reg-1']);
  });

  it('campos obrigatórios e regras: nada é enviado e cada campo mostra o motivo', async () => {
    const fixture = await setup();
    type('Nome completo', 'Rafael');
    type('Crie uma senha', '123');
    type('Nº de largada', '1000');
    submitButton().click();
    await settle();
    await fixture.whenStable();
    http.expectNone(`${publicEventUrl(EVENT_ID)}/registrations`);
    for (const message of [
      'Informe o nome completo (nome e sobrenome).',
      'Informe um e-mail válido.',
      'Use pelo menos 8 caracteres na senha.',
      'Aceite a política de privacidade para criar a conta.',
      'Escolha a categoria.',
      'Use de 1 a 3 dígitos (ex.: 27 ou 05).',
      'Informe a moto (ex.: Honda CRF 250F).',
      'Aceite o termo de responsabilidade para continuar.',
    ]) {
      expect(el.textContent).toContain(message);
    }
  });

  it('número já usado: a mensagem da API aparece no campo e some ao trocar o número', async () => {
    const fixture = await setup({ role: 'PILOT' });
    fillRegistration();
    submitButton().click();
    await settle();
    http.expectOne(`${publicEventUrl(EVENT_ID)}/registrations`).flush(
      { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', details: [{ field: 'raceNumber', message: 'O número 27 já está em uso nesta categoria. Escolha outro.' }] },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();
    await fixture.whenStable();
    expect(el.textContent).toContain('O número 27 já está em uso nesta categoria.');
    type('Nº de largada', '28');
    await fixture.whenStable();
    expect(el.textContent).not.toContain('já está em uso');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('piloto já logado: sem campos de conta, envia só a inscrição', async () => {
    await setup({ role: 'PILOT' });
    expect(el.textContent).toContain(`Inscrevendo como ${TEST_USERS.PILOT.name}`);
    expect(el.textContent).not.toContain('Crie uma senha');
    fillRegistration();
    submitButton().click();
    await settle();
    const req = http.expectOne(`${publicEventUrl(EVENT_ID)}/registrations`);
    expect(req.request.body.account).toBeUndefined();
    req.flush(CREATED, { status: 201, statusText: 'Created' });
    await settle();
    http.expectNone(ME_URL); // sessão já conhecida
    expect(navigate).toHaveBeenCalledWith(['/minhas-inscricoes', 'reg-1']);
  });

  it('vaga esgotada na hora de enviar: mensagem junto do botão e as vagas são recarregadas', async () => {
    const fixture = await setup({ role: 'PILOT' });
    fillRegistration();
    submitButton().click();
    await settle();
    http
      .expectOne(`${publicEventUrl(EVENT_ID)}/registrations`)
      .flush({ code: 'CATEGORY_FULL', message: 'As vagas desta categoria acabaram.' }, { status: 409, statusText: 'Conflict' });
    await settle();
    TestBed.tick(); // o reload do httpResource sai no próximo ciclo
    http.expectOne(publicEventUrl(EVENT_ID)).flush(EVENT);
    await settle();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('As vagas desta categoria acabaram.');
  });

  it('equipe logada: pede para sair e entrar como piloto, sem formulário', async () => {
    await setup({ role: 'SECRETARY' });
    expect(el.textContent).toContain('Você está conectado como equipe');
    expect(el.querySelector('form')).toBeNull();
  });

  it('inscrições ainda não abertas: avisa quando abrem, sem formulário', async () => {
    await setup({ event: { ...EVENT, registration: { isOpen: false, opensAt: '2099-01-15T12:00:00.000Z', closesAt: null } } });
    expect(el.textContent).toContain('As inscrições abrem');
    expect(el.textContent).toContain('às 09:00');
    expect(el.querySelector('form')).toBeNull();
  });

  it('link de evento inexistente ou não publicado: mensagem clara', async () => {
    await setup({ event: null });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Evento não encontrado.');
    expect(el.querySelector('h1')?.textContent).toContain('Inscrição');
  });
});
