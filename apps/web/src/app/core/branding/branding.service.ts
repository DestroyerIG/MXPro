import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { BrandPalette, deriveBrandPalette } from './color';

/** Identidade do contratante. No futuro virá da API (`Settings`); por enquanto, valores padrão do PDF. */
export interface Branding {
  name: string;
  /** Trecho inicial do nome destacado na cor da marca quando não há logo (ex.: "MX" em MXPRO). */
  nameAccent?: string;
  /** Cor principal em #RRGGBB. Os outros tons são derivados com contraste AA garantido. */
  primaryColor: string;
  /** URL do logo. Sem logo, a interface mostra o nome. */
  logoUrl?: string;
}

export const DEFAULT_BRANDING: Branding = { name: 'MXPRO', nameAccent: 'MX', primaryColor: '#E8590C' };

/**
 * Aplica a marca do contratante escrevendo as variáveis CSS `--brand-*` no <html>.
 *
 * `providedIn: 'root'`: existe uma única instância para o app inteiro (singleton), criada só
 * quando alguém a injeta pela primeira vez. Por isso fica em `core/`.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  // inject(): pede uma dependência ao Angular. Alternativa antiga: parâmetro no constructor.
  // DOCUMENT em vez de `document` global: deixa o service testável e compatível com SSR.
  private readonly root = inject(DOCUMENT).documentElement;

  private readonly _branding = signal<Branding>(DEFAULT_BRANDING);
  /** Somente leitura para quem consome: só o service muda a marca. */
  readonly branding = this._branding.asReadonly();

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
}
