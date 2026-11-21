import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';

/**
 * Moldura das telas do piloto no celular (PDF, página 5): faixa na cor da marca com o título,
 * conteúdo numa coluna estreita. Mostra quem está logado e o "Sair".
 */
@Component({
  selector: 'app-pilot-frame',
  imports: [RouterLink],
  template: `
    <div class="min-h-dvh bg-canvas">
      <header class="bg-brand text-on-brand">
        <div class="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-4">
          <h1 class="min-w-0 text-lg font-bold">{{ heading() }}</h1>
          @if (session.user()?.role === 'PILOT') {
            <a routerLink="/minhas-inscricoes" class="shrink-0 text-sm font-bold underline-offset-2 hover:underline">Minhas inscrições</a>
          }
        </div>
      </header>
      <main class="mx-auto max-w-md px-4 py-5">
        <ng-content />
      </main>
      @if (session.user(); as u) {
        <footer class="mx-auto flex max-w-md flex-wrap items-center justify-between gap-2 px-4 pb-8 text-sm text-ink-2">
          <span>Conectado como {{ u.name }}</span>
          <button type="button" class="font-bold text-brand-text underline-offset-2 hover:underline" (click)="session.logout()">Sair</button>
        </footer>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PilotFrame {
  protected readonly session = inject(SessionService);
  readonly heading = input.required<string>();
}
