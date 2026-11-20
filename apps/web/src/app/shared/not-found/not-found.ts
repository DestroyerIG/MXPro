import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Página 404 para qualquer rota desconhecida. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  // OnPush: o Angular só re-renderiza este componente quando um input muda, um evento
  // acontece nele ou um signal lido no template muda. É o padrão no Angular 22, mas
  // deixamos explícito para ficar claro (e exigido pela Definição de Pronto).
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {}
