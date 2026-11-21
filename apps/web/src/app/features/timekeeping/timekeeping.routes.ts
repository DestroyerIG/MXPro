import { type Routes } from '@angular/router';
import { TimingBoard } from './timing-board/timing-board';

/** Rotas da cronometragem. Bundle separado e enxuto (docs/arquitetura.md §6). */
export default [
  { path: '', component: TimingBoard, title: 'Cronometragem | MXPro' },
] satisfies Routes;
