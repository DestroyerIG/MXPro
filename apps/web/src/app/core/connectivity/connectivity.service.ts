import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

/**
 * Estado da conexão. Combina o que o navegador informa (eventos online/offline) com uma
 * simulação manual, para testar a cronometragem "sem internet" sem desligar o Wi-Fi.
 *
 * Atenção: `navigator.onLine === true` só garante que há rede, não que o servidor responde.
 * Quando a sincronização real existir, uma falha de envio também conta como offline.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly browserOnline = signal(this.window?.navigator.onLine ?? true);

  /** Simulação de queda de internet (ferramenta de desenvolvimento/treinamento). */
  readonly simulateOffline = signal(false);
  readonly online = computed(() => this.browserOnline() && !this.simulateOffline());

  constructor() {
    // Service de root vive o app inteiro, então não há o que remover depois.
    this.window?.addEventListener('online', () => this.browserOnline.set(true));
    this.window?.addEventListener('offline', () => this.browserOnline.set(false));
  }
}
