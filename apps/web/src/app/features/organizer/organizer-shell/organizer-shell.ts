import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ROLE_LABELS } from '@mxpro/shared';
import { SessionService } from '../../../core/auth/session.service';
import { type ThemePreference, ThemeService } from '../../../core/theme/theme.service';
import { BrandLogo } from '../../../shared/brand-logo/brand-logo';
import { ORGANIZER_NAV } from '../organizer-nav';

const THEME_CYCLE: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemePreference, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' };

/**
 * Layout da área do organizador: menu lateral grafite (PDF) + conteúdo da página atual.
 *
 * É um "componente de layout": a rota /painel aponta para ele e as páginas são rotas FILHAS,
 * desenhadas no <router-outlet> de dentro dele. Assim o menu não é recriado a cada navegação.
 *
 * Desktop (≥ 1024px): menu fixo. Celular/tablet: menu vira gaveta aberta pelo botão "Menu".
 */
@Component({
  selector: 'app-organizer-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BrandLogo],
  templateUrl: './organizer-shell.html',
  host: {
    // Escuta teclas no documento inteiro enquanto o layout existe (sem addEventListener manual).
    '(document:keydown.escape)': 'closeMenu()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerShell {
  private readonly injector = inject(Injector);
  private readonly theme = inject(ThemeService);

  protected readonly nav = ORGANIZER_NAV;
  private readonly session = inject(SessionService);
  protected readonly user = this.session.user;
  protected readonly roleLabel = computed(() => {
    const u = this.user();
    return u ? ROLE_LABELS[u.role] : '';
  });
  protected readonly themeLabel = computed(() => THEME_LABEL[this.theme.preference()]);

  /** Gaveta aberta no celular/tablet. No desktop o CSS ignora este estado. */
  protected readonly menuOpen = signal(false);

  private readonly menuButton = viewChild.required<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly firstLink = viewChild.required<ElementRef<HTMLAnchorElement>>('firstLink');
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');

  /**
   * "Pular para o conteúdo". Com <base href="/">, um href="#conteudo" puro levaria para "/#conteudo"
   * (recarregando na raiz); então cancelamos a navegação e só movemos o foco.
   */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.content().nativeElement.focus();
  }

  protected openMenu(): void {
    this.menuOpen.set(true);
    // afterNextRender: espera o Angular atualizar a tela (a gaveta ficar visível) e só então
    // move o foco para dentro dela. Antes disso o link ainda estaria invisível e não receberia foco.
    afterNextRender(() => this.firstLink().nativeElement.focus(), { injector: this.injector });
  }

  protected closeMenu(): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    // Devolve o foco a quem abriu a gaveta (só faz sentido se o botão estiver visível, no celular).
    afterNextRender(
      () => {
        const btn = this.menuButton().nativeElement;
        if (btn.offsetParent !== null) btn.focus();
      },
      { injector: this.injector },
    );
  }

  protected cycleTheme(): void {
    this.theme.preference.update((p) => THEME_CYCLE[p]);
  }

  protected logout(): void {
    void this.session.logout();
  }
}
