import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { type Branding, DEFAULT_BRANDING } from '@mxpro/shared';
import { BRANDING_TIMEOUT_MS, BRANDING_URL, BrandingService } from './branding.service';

const TRILHA: Branding = {
  brandName: 'TRILHA SUL', brandNameAccent: 'TRILHA', primaryColor: '#1C7ED6', logoUrl: null, publicNameDisplay: 'FULL_NAME',
};
const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name);

describe('BrandingService', () => {
  let http: HttpTestingController;

  function create() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(BrandingService);
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
  });
  afterEach(() => {
    http?.verify(); // nenhuma requisição esquecida
    vi.useRealTimers();
  });

  it('sem cache, começa com a marca padrão do escopo', () => {
    expect(create().branding()).toEqual(DEFAULT_BRANDING);
  });

  it('refresh: aplica a marca da API (variáveis CSS) e guarda no aparelho', async () => {
    const service = create();
    const done = service.refresh();
    http.expectOne(BRANDING_URL).flush(TRILHA);
    await done;
    expect(service.branding()).toEqual(TRILHA);
    expect(cssVar('--brand-primary')).toBe('#1c7ed6');
    expect(JSON.parse(localStorage.getItem('mxpro.branding')!)).toEqual(TRILHA);
  });

  it('ao abrir de novo (ex.: offline), usa a marca guardada sem esperar a API', () => {
    localStorage.setItem('mxpro.branding', JSON.stringify(TRILHA));
    const service = create();
    expect(service.branding()).toEqual(TRILHA);
    expect(cssVar('--brand-primary')).toBe('#1c7ed6');
  });

  it('API fora do ar: refresh não lança erro e mantém a marca atual', async () => {
    localStorage.setItem('mxpro.branding', JSON.stringify(TRILHA));
    const service = create();
    const done = service.refresh();
    http.expectOne(BRANDING_URL).flush('erro', { status: 503, statusText: 'Service Unavailable' });
    await expect(done).resolves.toBeUndefined();
    expect(service.branding()).toEqual(TRILHA);
  });

  it(`sem resposta em ${BRANDING_TIMEOUT_MS / 1000} s, desiste e mantém a marca atual`, async () => {
    vi.useFakeTimers();
    const service = create();
    const done = service.refresh();
    http.expectOne(BRANDING_URL); // nunca responde
    await vi.advanceTimersByTimeAsync(BRANDING_TIMEOUT_MS);
    await done;
    expect(service.branding()).toEqual(DEFAULT_BRANDING);
  });

  it('dado inválido vindo da API é ignorado (não quebra a tela nem vai para o cache)', async () => {
    const service = create();
    const done = service.refresh();
    http.expectOne(BRANDING_URL).flush({ ...TRILHA, primaryColor: 'azul' });
    await done;
    expect(service.branding()).toEqual(DEFAULT_BRANDING);
    expect(localStorage.getItem('mxpro.branding')).toBeNull();
  });
});
