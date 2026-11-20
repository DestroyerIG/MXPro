import { Routes } from '@angular/router';
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
      ...ORGANIZER_NAV.filter((item) => item.path !== '' && item.path !== 'cronometragem').map((item) => ({
        path: item.path,
        component: ComingSoon,
        title: `${item.label} | MXPro`,
        data: { heading: item.label, description: item.description },
      })),
    ],
  },
] satisfies Routes;
