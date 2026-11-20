import { Routes } from '@angular/router';

/**
 * Rotas raiz. Cada área é carregada sob demanda (lazy loading) com `loadChildren`:
 * o código de /cronometragem não é baixado por quem só abre /ao-vivo, e vice-versa.
 * URLs em pt-BR (o usuário vê); nomes de pastas/classes em inglês (convenção do código).
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  { path: 'painel', loadChildren: () => import('./features/organizer/organizer.routes') },
  { path: 'cronometragem', loadChildren: () => import('./features/timekeeping/timekeeping.routes') },
  { path: 'ao-vivo', loadChildren: () => import('./features/live/live.routes') },
  { path: 'componentes', loadChildren: () => import('./features/design-system/design-system.routes') },
  {
    path: '**',
    loadComponent: () => import('./shared/not-found/not-found').then((m) => m.NotFound),
    title: 'Página não encontrada | MXPro',
  },
];
