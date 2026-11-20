import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Role, SessionResponse, SessionUser } from '@mxpro/shared';
import { authInterceptor } from './auth.interceptor';
import { ME_URL, SessionService } from './session.service';

/** Usuários fictícios para os testes (mesmos nomes do seed). Só usado em arquivos .spec.ts. */
export const TEST_USERS: Record<Role, SessionUser> = {
  ORGANIZER: { id: '019a0000-0000-7000-8000-000000000001', name: 'Marina Duarte', email: 'organizador@mxpro.test', role: 'ORGANIZER' },
  SECRETARY: { id: '019a0000-0000-7000-8000-000000000002', name: 'Paulo Ribeiro', email: 'secretaria@mxpro.test', role: 'SECRETARY' },
  TIMEKEEPER: { id: '019a0000-0000-7000-8000-000000000003', name: 'Ana Souza', email: 'cronometrista@mxpro.test', role: 'TIMEKEEPER' },
  PILOT: { id: '019a0000-0000-7000-8000-000000000004', name: 'Rafael Menezes', email: 'piloto@mxpro.test', role: 'PILOT' },
};

export function sessionResponse(role: Role): SessionResponse {
  return { user: TEST_USERS[role], expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString() };
}

/** HttpClient falso (HttpTestingController) com o mesmo interceptor do app. */
export function provideTestHttp() {
  return [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()];
}

/** Simula "já estava logado": o app pergunta /api/auth/me e a API responde com o usuário do perfil. */
export async function signInAs(role: Role): Promise<void> {
  const restoring = TestBed.inject(SessionService).restore();
  TestBed.inject(HttpTestingController).expectOne(ME_URL).flush(sessionResponse(role));
  await restoring;
}
