import { type Routes } from '@angular/router';
import { guestOnly, redirectToHome, requireRoles } from './core/auth/auth.guards';

/**
 * Rotas raiz. Cada área é carregada sob demanda (lazy loading) com `loadChildren`:
 * o código de /cronometragem não é baixado por quem só abre /ao-vivo, e vice-versa.
 * URLs em pt-BR (o usuário vê); nomes de pastas/classes em inglês (convenção do código).
 *
 * `canMatch` decide quem pode abrir cada área (UX). A permissão de verdade é checada na API.
 */
export const routes: Routes = [
  // Raiz: cada perfil cai na sua área; quem não está logado, no login.
  { path: '', pathMatch: 'full', redirectTo: redirectToHome },
  {
    path: 'entrar',
    canMatch: [guestOnly],
    loadComponent: () => import('./features/auth/login-page/login-page').then((m) => m.LoginPage),
    title: 'Entrar | MXPro',
  },
  {
    path: 'painel',
    canMatch: [requireRoles('ORGANIZER', 'SECRETARY')],
    loadChildren: () => import('./features/organizer/organizer.routes'),
  },
  {
    path: 'cronometragem',
    canMatch: [requireRoles('TIMEKEEPER', 'ORGANIZER')],
    loadChildren: () => import('./features/timekeeping/timekeeping.routes'),
  },
  // Inscrição pelo link do evento (pública: quem não tem conta cria na própria inscrição).
  {
    path: 'inscricao/:eventId',
    loadComponent: () => import('./features/registration/registration-page/registration-page').then((m) => m.RegistrationPage),
    title: 'Inscrição | MXPro',
  },
  {
    path: 'minhas-inscricoes',
    canMatch: [requireRoles('PILOT')],
    loadChildren: () => import('./features/registration/pilot.routes'),
  },
  // Públicas (sem login): resultados ao vivo/telão e o catálogo de componentes.
  { path: 'ao-vivo', loadChildren: () => import('./features/live/live.routes') },
  { path: 'componentes', loadChildren: () => import('./features/design-system/design-system.routes') },
  {
    path: '**',
    loadComponent: () => import('./shared/not-found/not-found').then((m) => m.NotFound),
    title: 'Página não encontrada | MXPro',
  },
];
