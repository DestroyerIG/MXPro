import { type Routes } from '@angular/router';
import { LiveBoard } from './live-board/live-board';

/**
 * Resultados ao vivo (públicos, sem login). Bundle separado e leve.
 * /ao-vivo/telao: modo telão (este passo). A página pública para celular, com abas por categoria,
 * virá em /ao-vivo; até lá, /ao-vivo leva ao telão.
 */
export default [
  { path: '', pathMatch: 'full', redirectTo: 'telao' },
  { path: 'telao', component: LiveBoard, title: 'Telão ao vivo | MXPro' },
] satisfies Routes;
