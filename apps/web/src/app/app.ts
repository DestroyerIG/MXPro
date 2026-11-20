import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastOutlet } from './shared/ui/toast/toast-outlet';

/**
 * Componente raiz: o "buraco" onde o Router desenha a área atual + a região de toasts,
 * que precisa existir uma vez só, acima de todas as telas.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastOutlet],
  template: '<router-outlet /><ui-toast-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
