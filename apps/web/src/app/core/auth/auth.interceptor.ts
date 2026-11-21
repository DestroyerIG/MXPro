import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { LOGIN_URL, ME_URL, SessionService } from './session.service';

/**
 * Interceptor: uma função pela qual TODA requisição do HttpClient passa, na ida e na volta.
 * Serve para regras que valem para o app inteiro, sem repetir código em cada service.
 *
 * Aqui: se a API responder 401 (sessão expirou ou foi encerrada), esquece o usuário e leva ao login.
 *
 * Não precisamos anexar o cookie: front e API ficam na MESMA origem (proxy em desenvolvimento,
 * mesmo domínio em produção) e o navegador envia o cookie sozinho. Se um dia a API for para outro
 * domínio, seria aqui o lugar de ligar `withCredentials: true`.
 *
 * Ficam de fora: o próprio login (401 = senha errada, quem trata é a tela) e o /me (o
 * SessionService já trata a resposta dele).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url === LOGIN_URL || req.url === ME_URL) return next(req);
  const session = inject(SessionService);
  return next(req).pipe(
    tap({
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401) session.expire();
      },
    }),
  );
};
