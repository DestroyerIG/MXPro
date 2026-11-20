import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { type LoginRequest, type Role, type SessionResponse, type SessionUser } from '@mxpro/shared';
import { firstValueFrom, timeout } from 'rxjs';

export type { SessionUser };

export const ME_URL = '/api/auth/me';
export const LOGIN_URL = '/api/auth/login';
export const LOGOUT_URL = '/api/auth/logout';
export const LOGIN_PAGE = '/entrar';
/** Sem resposta da API nesse tempo, seguimos com o que já sabemos (a tela não fica presa na rede). */
export const SESSION_CHECK_TIMEOUT_MS = 6000;

const CACHE_KEY = 'mxpro.session-user';

/** Para onde cada perfil vai depois do login (ou quando abre uma área que não é a dele). */
export const HOME_BY_ROLE: Record<Role, string> = {
  ORGANIZER: '/painel',
  SECRETARY: '/painel',
  TIMEKEEPER: '/cronometragem',
  PILOT: '/ao-vivo', // área do piloto chega na fase 7; até lá, os resultados ao vivo
};

/**
 * Quem está logado.
 *
 * O login em si é um cookie httpOnly que o JavaScript NÃO consegue ler (é o que protege a sessão
 * contra roubo por script malicioso). Então, para saber quem é o usuário, o front pergunta à API
 * (`GET /api/auth/me`) e guarda a resposta num signal.
 *
 * Offline: a cronometragem precisa abrir sem internet. Por isso o último usuário confirmado fica
 * guardado no aparelho (só id, nome, e-mail e perfil, nunca a senha nem o token). Esse dado serve
 * apenas para a INTERFACE; quem decide o que cada um pode fazer continua sendo o backend.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<SessionUser | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  /** Promessa compartilhada: vários guards na mesma navegação geram UMA consulta à API. */
  private restoring: Promise<SessionUser | null> | null = null;

  /** Descobre quem está logado. Os guards chamam isto; a API é consultada uma vez por abertura do app. */
  restore(): Promise<SessionUser | null> {
    this.restoring ??= this.load();
    return this.restoring;
  }

  async login(credentials: LoginRequest): Promise<SessionUser> {
    const { user } = await firstValueFrom(this.http.post<SessionResponse>(LOGIN_URL, credentials));
    this.setUser(user);
    return user;
  }

  /** Sai: apaga a sessão no servidor e no aparelho. Sem internet, sai pelo menos deste aparelho. */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(LOGOUT_URL, null));
    } catch {
      // Offline: o cookie expira sozinho no servidor; aqui só esquecemos o usuário.
    }
    this.forget();
    await this.router.navigateByUrl(LOGIN_PAGE);
  }

  /**
   * A API disse que a sessão não vale mais (401). Esquece o usuário e leva ao login,
   * guardando a página atual para voltar a ela depois de entrar.
   */
  expire(): void {
    if (!this._user()) return; // já tratado (várias chamadas podem falhar juntas)
    this.forget();
    const back = this.router.url;
    void this.router.navigate([LOGIN_PAGE], { queryParams: isSafeReturnUrl(back) ? { voltar: back } : {} });
  }

  private async load(): Promise<SessionUser | null> {
    const cached = readCache();
    if (cached) {
      // Abre na hora com o usuário conhecido e confirma em segundo plano.
      this._user.set(cached);
      void this.check();
      return cached;
    }
    await this.check();
    return this._user();
  }

  /** Confirma a sessão na API. 401 = não está logado. Falha de rede/timeout = mantém o que já sabe. */
  private async check(): Promise<void> {
    try {
      const { user } = await firstValueFrom(
        this.http.get<SessionResponse>(ME_URL).pipe(timeout(SESSION_CHECK_TIMEOUT_MS)),
      );
      this.setUser(user);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) this.expire();
    }
  }

  private setUser(user: SessionUser): void {
    this._user.set(user);
    this.restoring = Promise.resolve(user);
    writeCache(user);
  }

  private forget(): void {
    this._user.set(null);
    this.restoring = Promise.resolve(null);
    writeCache(null);
  }
}

/**
 * Só aceita voltar para uma página DESTE site. Sem isso, um link como
 * `/entrar?voltar=https://site-falso.com` levaria o usuário para fora depois do login (open redirect).
 */
export function isSafeReturnUrl(url: string | null | undefined): url is string {
  return !!url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') && !url.startsWith(LOGIN_PAGE);
}

function readCache(): SessionUser | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function writeCache(user: SessionUser | null): void {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage bloqueado: só não abre offline na próxima vez */
  }
}
