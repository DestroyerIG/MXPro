import { inject } from '@angular/core';
import { type CanMatchFn, type RedirectFunction, Router } from '@angular/router';
import type { Role } from '@mxpro/shared';
import { HOME_BY_ROLE, LOGIN_PAGE, SessionService, isSafeReturnUrl } from './session.service';

/**
 * Guards de rota: funções que o Router consulta ANTES de abrir uma página. Devolvem `true` (pode)
 * ou um UrlTree (vai para outro lugar).
 *
 * Usamos `canMatch` em vez de `canActivate`: com canMatch a rota nem "casa" quando o acesso é
 * negado, então o código lazy daquela área nem é baixado. O canActivate só roda depois de baixar.
 *
 * Isto melhora a experiência (ninguém vê uma tela que vai dar erro), mas NÃO é segurança:
 * quem garante a permissão é o backend, em toda rota da API.
 */

/** Só entra quem estiver logado com um destes perfis. Os demais vão para a área do próprio perfil. */
export function requireRoles(...roles: Role[]): CanMatchFn {
  return async () => {
    const router = inject(Router);
    const user = await inject(SessionService).restore();
    if (!user) {
      // URL que a pessoa tentou abrir: volta para ela depois do login.
      const attempted = router.currentNavigation()?.extractedUrl;
      const back = attempted ? router.serializeUrl(attempted) : null;
      return router.createUrlTree([LOGIN_PAGE], { queryParams: isSafeReturnUrl(back) ? { voltar: back } : {} });
    }
    return roles.includes(user.role) ? true : router.parseUrl(HOME_BY_ROLE[user.role]);
  };
}

/** Tela de login: quem já está logado vai direto para a sua área. */
export const guestOnly: CanMatchFn = async () => {
  // inject() só funciona ANTES do primeiro await (depois dele saímos do contexto de injeção).
  const router = inject(Router);
  const user = await inject(SessionService).restore();
  return user ? router.parseUrl(HOME_BY_ROLE[user.role]) : true;
};

/** Endereço raiz (/): manda cada um para a sua área, ou para o login. */
export const redirectToHome: RedirectFunction = async () => {
  const user = await inject(SessionService).restore();
  return user ? HOME_BY_ROLE[user.role] : LOGIN_PAGE;
};
