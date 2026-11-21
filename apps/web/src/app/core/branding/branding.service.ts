import { HttpClient } from '@angular/common/http';
import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { type Branding, DEFAULT_BRANDING } from '@mxpro/shared';
import { firstValueFrom, timeout } from 'rxjs';
import { type BrandPalette, deriveBrandPalette } from './color';

export type { Branding };

const CACHE_KEY = 'mxpro.branding';
/** Sem resposta nesse tempo, seguimos com a marca já aplicada (a tela não espera a rede). */
export const BRANDING_TIMEOUT_MS = 4000;
export const BRANDING_URL = '/api/settings/branding';

/**
 * Identidade visual do contratante, vinda da API (`GET /api/settings/branding`).
 *
 * Ordem ao abrir o app:
 *  1. aplica na hora a última marca conhecida (guardada no aparelho) ou a padrão;
 *  2. busca a atual na API em segundo plano (`refresh`) e aplica se mudou.
 * Assim a cronometragem e o telão abrem com a marca certa mesmo sem internet.
 *
 * Aplicar = escrever as variáveis CSS `--brand-*` no <html> (tons derivados com contraste AA).
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly http = inject(HttpClient);

  private readonly _branding = signal<Branding>(DEFAULT_BRANDING);
  /** Somente leitura para quem consome: só o service muda a marca. */
  readonly branding = this._branding.asReadonly();

  constructor() {
    const cached = readCache();
    if (cached) this.tryApply(cached);
  }

  /** Busca a marca atual na API. Nunca lança erro: falhou = mantém a que está aplicada. */
  async refresh(): Promise<void> {
    try {
      const branding = await firstValueFrom(this.http.get<Branding>(BRANDING_URL).pipe(timeout(BRANDING_TIMEOUT_MS)));
      if (this.tryApply(branding)) writeCache(branding);
    } catch {
      // Offline ou API fora do ar: segue com a marca em cache/padrão.
    }
  }

  /** Aplica uma marca (também usado pela simulação no catálogo /componentes). Lança se a cor for inválida. */
  apply(branding: Branding): BrandPalette {
    const palette = deriveBrandPalette(branding.primaryColor);
    const vars: Record<string, string> = {
      '--brand-primary': palette.primary,
      '--brand-primary-strong': palette.strong,
      '--brand-on-primary': palette.onPrimary,
      '--brand-text-light': palette.textOnLight,
      '--brand-text-dark': palette.textOnDark,
    };
    for (const [name, value] of Object.entries(vars)) this.root.style.setProperty(name, value);
    this._branding.set(branding);
    return palette;
  }

  private tryApply(branding: Branding): boolean {
    try {
      this.apply(branding);
      return true;
    } catch {
      return false; // dado inválido (ex.: cor fora do formato): ignora e mantém a atual
    }
  }
}

function readCache(): Branding | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Branding) : null;
  } catch {
    return null;
  }
}

function writeCache(branding: Branding): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(branding));
  } catch {
    /* storage bloqueado: só não lembra para a próxima abertura */
  }
}
