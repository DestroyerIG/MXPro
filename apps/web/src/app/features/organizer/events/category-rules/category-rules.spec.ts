import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MOTOCROSS_TEMPLATE } from '@mxpro/rules-engine';
import type { EventCategoryDto, EventCategoryRulesDto, Role } from '@mxpro/shared';
import { provideTestHttp, signInAs } from '../../../../core/auth/session.testing';
import { EVENTS_URL, eventCategoriesUrl, rulesUrl } from '../events-api';
import { eventDto, settle } from '../events.testing';
import { CategoryRules } from './category-rules';

const EVENT_ID = '019a8f00-0000-7000-8000-000000000102';
const MX1: EventCategoryDto = {
  id: 'ec-mx1', eventId: EVENT_ID, category: { id: 'c-mx1', name: 'MX1' }, modality: 'MOTOCROSS',
  entryFeeCents: 15000, maxEntries: 40, heatCount: 2,
};
const XC: EventCategoryDto = {
  id: 'ec-xc', eventId: EVENT_ID, category: { id: 'c-xc', name: 'Cross Country' }, modality: 'CROSS_COUNTRY',
  entryFeeCents: 12000, maxEntries: null, heatCount: 0,
};

function rulesDto(patch: Partial<EventCategoryRulesDto> = {}): EventCategoryRulesDto {
  return {
    eventCategoryId: MX1.id, supported: true, config: structuredClone(MOTOCROSS_TEMPLATE), saved: false, frozen: false,
    current: null, history: [], ...patch,
  };
}
const V1 = { version: 1, createdAt: '2026-11-21T13:00:00.000Z', updatedAt: '2026-11-21T13:00:00.000Z', createdBy: { id: 'u1', name: 'Marina Duarte' }, reason: null };

describe('CategoryRules (regras da prova da categoria)', () => {
  let http: HttpTestingController;
  let el: HTMLElement;

  async function setup(rules: EventCategoryRulesDto, { role = 'ORGANIZER' as Role, category = MX1 } = {}) {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestHttp()] });
    http = TestBed.inject(HttpTestingController);
    await signInAs(role);
    const fixture = TestBed.createComponent(CategoryRules);
    fixture.componentRef.setInput('id', EVENT_ID);
    fixture.componentRef.setInput('eventCategoryId', category.id);
    fixture.detectChanges();
    await settle();
    http.expectOne(`${EVENTS_URL}/${EVENT_ID}`).flush(eventDto());
    http.expectOne(eventCategoriesUrl(EVENT_ID)).flush({ categories: [MX1, XC] });
    http.expectOne(rulesUrl(EVENT_ID, category.id)).flush(rules);
    await settle();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
    return fixture;
  }

  const input = (label: string) => {
    const field = [...el.querySelectorAll('ui-form-field')].find((f) => f.querySelector('label')?.textContent?.trim().startsWith(label));
    return field!.querySelector('input, select, textarea') as HTMLInputElement;
  };
  const type = (target: HTMLInputElement, value: string) => {
    target.value = value;
    target.dispatchEvent(new Event('input'));
  };
  const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

  it('modelo pronto: mostra os valores do PDF e avisa que ainda não foi salvo', async () => {
    await setup(rulesDto());
    expect(el.querySelector('h1')?.textContent).toContain('Regras da prova - MX1');
    expect(el.textContent).toContain('Modelo pronto, ainda não salvo');
    expect(input('Duração').value).toBe('20');
    expect(input('Volta mínima').value).toBe('0:45.000');
    expect(input('Penalidade').value).toBe('10');
    const points = [...el.querySelectorAll<HTMLInputElement>('ol input')].map((i) => i.value);
    expect(points.slice(0, 6)).toEqual(['25', '22', '20', '18', '16', '15']);
  });

  it('salva convertendo os textos para milissegundos', async () => {
    const fixture = await setup(rulesDto());
    type(input('Volta mínima'), '0:50');
    type(input('Penalidade'), '2,5');
    button('Remover última').click();
    fixture.detectChanges();
    button('Salvar regras').click();
    await settle();
    const req = http.expectOne(rulesUrl(EVENT_ID, MX1.id));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.config).toMatchObject({ minLapMs: 50_000, defaultPenaltyMs: 2_500 });
    expect(req.request.body.config.points).toHaveLength(19);
    expect(req.request.body.reason).toBeUndefined();
    req.flush(rulesDto({ saved: true, config: req.request.body.config, current: V1, history: [V1] }));
    await settle();
    await fixture.whenStable();
    expect(el.textContent).toContain('Versão 1, salva');
  });

  it('valor inválido não chega na API', async () => {
    const fixture = await setup(rulesDto());
    type(input('Volta mínima'), 'rápido');
    const firstPoint = el.querySelector<HTMLInputElement>('ol input')!;
    type(firstPoint, '10'); // 1º valendo menos que o 2º
    fixture.detectChanges();
    button('Salvar regras').click();
    await settle();
    await fixture.whenStable();
    http.expectNone(rulesUrl(EVENT_ID, MX1.id));
    expect(el.textContent).toContain('Use minutos:segundos.milésimos');
    expect(el.textContent).toContain('Cada posição deve valer o mesmo ou menos que a anterior.');
  });

  it('congelada: pede o motivo e o envia junto', async () => {
    const fixture = await setup(rulesDto({ saved: true, frozen: true, current: V1, history: [V1] }));
    expect(el.textContent).toContain('Congelada na largada');
    button('Salvar regras').click();
    await settle();
    await fixture.whenStable();
    http.expectNone(rulesUrl(EVENT_ID, MX1.id));
    expect(el.textContent).toContain('informe o motivo da mudança');
    type(input('Motivo'), 'Pista encurtada pela chuva');
    fixture.detectChanges();
    button('Salvar regras').click();
    await settle();
    expect(http.expectOne(rulesUrl(EVENT_ID, MX1.id)).request.body.reason).toBe('Pista encurtada pela chuva');
  });

  it('erro da API aparece no campo e some quando o valor muda', async () => {
    const fixture = await setup(rulesDto());
    button('Salvar regras').click();
    await settle();
    http
      .expectOne(rulesUrl(EVENT_ID, MX1.id))
      .flush({ code: 'VALIDATION', message: 'Confira os campos.', details: [{ field: 'minLapMs', message: 'Volta mínima recusada.' }] }, { status: 400, statusText: 'Bad Request' });
    await settle();
    await fixture.whenStable();
    expect(el.textContent).toContain('Volta mínima recusada.');
    type(input('Volta mínima'), '0:40');
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Volta mínima recusada.');
  });

  it('secretaria só consulta: campos desabilitados e sem botão de salvar', async () => {
    await setup(rulesDto({ saved: true, current: V1, history: [V1] }), { role: 'SECRETARY' });
    expect(input('Duração').disabled).toBe(true);
    expect([...el.querySelectorAll<HTMLInputElement>('ol input')].every((i) => i.disabled)).toBe(true);
    expect(button('Salvar regras')).toBeUndefined();
    expect(el.textContent).toContain('Só o organizador altera');
  });

  it('modalidade sem regras no motor: aviso, sem formulário', async () => {
    await setup(rulesDto({ eventCategoryId: XC.id, supported: false, config: null }), { category: XC });
    expect(el.textContent).toContain('As regras de Cross Country ainda não estão disponíveis');
    expect(el.querySelector('form')).toBeNull();
  });
});
