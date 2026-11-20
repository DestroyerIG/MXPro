import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';

/**
 * /painel/cronometragem: ponto de partida para a pista. A tela de cronometragem em si é uma rota
 * separada (/cronometragem), fora do layout do painel: abre em tela cheia no tablet e tem bundle
 * próprio e enxuto, para carregar rápido e funcionar offline.
 * Provisório: a lista de baterias virá da API.
 */
@Component({
  selector: 'app-timing-hub',
  imports: [RouterLink, Button, Card, StatusBadge],
  template: `
    <h1 class="text-2xl font-bold">Cronometragem</h1>
    <p class="mt-1 text-ink-2">Escolha a bateria para abrir a tela de pista no tablet ou celular.</p>
    <ui-card class="mt-6 max-w-xl">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="font-bold">Bateria 1 • MX2</p>
          <p class="text-sm text-ink-2">Cronometrista: Ana Souza • 8 pilotos</p>
        </div>
        <ui-status-badge tone="ok">EM PROVA</ui-status-badge>
      </div>
      <a uiButton size="lg" class="mt-4 w-full" routerLink="/cronometragem">Abrir tela de pista</a>
    </ui-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimingHub {}
