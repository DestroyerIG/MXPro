import { type Routes } from '@angular/router';
import { ComingSoon } from '../../shared/coming-soon/coming-soon';
import { EventDashboard } from './event-dashboard/event-dashboard';
import { ORGANIZER_NAV } from './organizer-nav';
import { OrganizerShell } from './organizer-shell/organizer-shell';
import { TimingHub } from './timing-hub/timing-hub';

/**
 * Área do organizador (/painel). O OrganizerShell é o layout; as páginas são rotas filhas.
 * Os itens do menu que ainda não têm tela usam o ComingSoon com textos vindos do `data`.
 * Este arquivo inteiro só é baixado quando alguém entra em /painel (lazy loading).
 */
export default [
  {
    path: '',
    component: OrganizerShell,
    children: [
      { path: '', component: EventDashboard, title: 'Painel do evento | MXPro' },
      { path: 'cronometragem', component: TimingHub, title: 'Cronometragem | MXPro' },
      // Telas de eventos: loadComponent baixa cada uma só quando é aberta (o formulário é o maior pedaço).
      {
        path: 'categorias',
        loadComponent: () => import('./categories/categories-page').then((m) => m.CategoriesPage),
        title: 'Categorias | MXPro',
      },
      {
        path: 'eventos',
        loadComponent: () => import('./events/events-list/events-list').then((m) => m.EventsList),
        title: 'Eventos | MXPro',
      },
      {
        path: 'eventos/novo',
        loadComponent: () => import('./events/event-form/event-form').then((m) => m.EventForm),
        title: 'Novo evento | MXPro',
      },
      {
        path: 'eventos/:id',
        loadComponent: () => import('./events/event-form/event-form').then((m) => m.EventForm),
        title: 'Evento | MXPro',
      },
      {
        path: 'eventos/:id/categorias/:eventCategoryId/regras',
        loadComponent: () => import('./events/category-rules/category-rules').then((m) => m.CategoryRules),
        title: 'Regras da prova | MXPro',
      },
      {
        path: 'financeiro',
        loadComponent: () => import('./finance/finance-page').then((m) => m.FinancePage),
        title: 'Financeiro | MXPro',
      },
      ...ORGANIZER_NAV.filter((item) => !['', 'cronometragem', 'eventos', 'categorias', 'financeiro'].includes(item.path)).map((item) => ({
        path: item.path,
        component: ComingSoon,
        title: `${item.label} | MXPro`,
        data: { heading: item.label, description: item.description },
      })),
    ],
  },
] satisfies Routes;
