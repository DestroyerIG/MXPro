import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, computed, inject, signal } from '@angular/core';
import { BrandLogo } from '../../../shared/brand-logo/brand-logo';
import { formatGap, msToDisplay } from '../../../shared/format/race-time';
import { LiveFeed } from '../live-feed.service';

/** Linhas por página do telão. Mais que isso fica pequeno demais para ler de longe. */
export const ROWS_PER_PAGE = 10;
export const PAGE_ROTATION_MS = 10_000;
const CONTROLS_IDLE_MS = 3_000;

const clockFormat = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' });

/**
 * Telão de resultado ao vivo (docs/arquitetura.md §4.4, PDF p. 7). Somente leitura, sem login.
 * Feito para TV: tipografia proporcional à tela, tema escuro fixo, sem interação obrigatória.
 */
@Component({
  selector: 'app-live-board',
  imports: [BrandLogo],
  templateUrl: './live-board.html',
  providers: [LiveFeed],
  host: { '(document:mousemove)': 'showControls()', '(document:keydown)': 'showControls()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveBoard {
  protected readonly feed = inject(LiveFeed);
  private readonly document = inject(DOCUMENT);

  protected readonly heat = computed(() => this.feed.standings()?.heat ?? null);
  protected readonly sponsors = computed(() => this.feed.standings()?.sponsors ?? []);
  protected readonly updatedAt = computed(() => {
    const at = this.feed.standings()?.updatedAt;
    return at ? clockFormat.format(at) : '';
  });

  // --- paginação automática ---
  private readonly page = signal(0);
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.feed.rows().length / ROWS_PER_PAGE)));
  /** Página atual, sempre válida mesmo se o nº de pilotos diminuir. */
  protected readonly currentPage = computed(() => this.page() % this.pageCount());
  protected readonly pageRows = computed(() =>
    this.feed.rows()
      .slice(this.currentPage() * ROWS_PER_PAGE, (this.currentPage() + 1) * ROWS_PER_PAGE)
      .map((r) => ({ ...r, best: r.bestLapMs === null ? '-' : msToDisplay(r.bestLapMs), gapText: formatGap(r.gap) })),
  );
  protected readonly pages = computed(() => Array.from({ length: this.pageCount() }, (_, i) => i));

  // --- controles que somem (tela cheia) ---
  protected readonly controlsVisible = signal(false);
  private idleTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const rotation = setInterval(() => this.page.update((p) => p + 1), PAGE_ROTATION_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(rotation);
      clearTimeout(this.idleTimer);
    });
  }

  protected showControls(): void {
    this.controlsVisible.set(true);
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.controlsVisible.set(false), CONTROLS_IDLE_MS);
  }

  protected toggleFullscreen(): void {
    if (this.document.fullscreenElement) void this.document.exitFullscreen();
    else void this.document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
}
