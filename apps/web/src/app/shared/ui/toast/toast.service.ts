import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger';

export interface ToastAction {
  /** Verbo da ação, ex.: "Desfazer". */
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

export interface ToastOptions {
  tone?: ToastTone;
  action?: ToastAction;
  /** Tempo na tela. Padrão: 5 s (tempo do "Desfazer" na pista). */
  durationMs?: number;
}

const MAX_VISIBLE = 3;

/**
 * Fila de toasts do app. Qualquer tela injeta e chama `show(...)`; o <ui-toast-outlet> (no App)
 * desenha a lista. Estado em signal: o outlet se atualiza sozinho quando a lista muda.
 *
 * Na pista o toast com "Desfazer" substitui o "tem certeza?" (docs/arquitetura.md §4.3).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly _toasts = signal<readonly Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(message: string, options: ToastOptions = {}): number {
    const id = ++this.seq;
    const toast: Toast = { id, message, tone: options.tone ?? 'info', action: options.action };
    this._toasts.update((list) => [...list, toast].slice(-MAX_VISIBLE));
    this.timers.set(id, setTimeout(() => this.dismiss(id), options.durationMs ?? 5000));
    return id;
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Executa a ação do toast (ex.: Desfazer) e o fecha. */
  runAction(id: number): void {
    const toast = this._toasts().find((t) => t.id === id);
    this.dismiss(id);
    toast?.action?.run();
  }
}
