import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'mxpro.theme';

/**
 * Tema claro/escuro. "system" segue o sistema operacional (prefers-color-scheme no CSS);
 * "light"/"dark" forçam o tema via atributo `data-theme` no <html>.
 * A preferência fica no localStorage do aparelho (é conveniência, não dado de negócio).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;

  /** signal(): valor reativo. Quem lê `preference()` em template/computed é atualizado quando muda. */
  readonly preference = signal<ThemePreference>(readStored());

  constructor() {
    // effect(): roda agora e de novo sempre que um signal lido dentro dele mudar.
    // Aqui é o uso certo de effect: sincronizar estado do Angular com algo FORA dele (DOM e storage).
    effect(() => {
      const pref = this.preference();
      if (pref === 'system') this.root.removeAttribute('data-theme');
      else this.root.setAttribute('data-theme', pref);
      try {
        localStorage.setItem(STORAGE_KEY, pref);
      } catch {
        /* storage bloqueado (aba anônima etc.): o tema só não é lembrado */
      }
    });
  }
}

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}
