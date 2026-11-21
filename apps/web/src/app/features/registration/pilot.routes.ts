import { type Routes } from '@angular/router';

/** Área do piloto (/minhas-inscricoes): lista e pagamento de cada inscrição. Só PILOT (guard no app.routes). */
export default [
  {
    path: '',
    loadComponent: () => import('./my-registrations/my-registrations').then((m) => m.MyRegistrations),
    title: 'Minhas inscrições | MXPro',
  },
  {
    path: ':id',
    loadComponent: () => import('./payment-page/payment-page').then((m) => m.PaymentPage),
    title: 'Pagamento da inscrição | MXPro',
  },
] satisfies Routes;
