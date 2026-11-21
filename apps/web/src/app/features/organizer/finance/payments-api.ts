import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import type { MercadoPagoConnectResponse } from '@mxpro/shared';
import { firstValueFrom } from 'rxjs';

export const MERCADO_PAGO_URL = '/api/payments/mercadopago';

/**
 * Sair do app para um site externo (a autorização no Mercado Pago). É um `InjectionToken` com
 * fábrica: o app usa o `location.assign` de verdade e os testes trocam por uma função espiã,
 * sem o navegador sair da página no meio do teste.
 */
export const EXTERNAL_NAVIGATION = new InjectionToken<(url: string) => void>('EXTERNAL_NAVIGATION', {
  providedIn: 'root',
  factory: () => (url: string) => window.location.assign(url),
});

/** Alterações da conta do Mercado Pago (a leitura fica num `httpResource` na tela). */
@Injectable({ providedIn: 'root' })
export class PaymentsApi {
  private readonly http = inject(HttpClient);

  startMercadoPagoConnection(): Promise<MercadoPagoConnectResponse> {
    return firstValueFrom(this.http.post<MercadoPagoConnectResponse>(`${MERCADO_PAGO_URL}/connect`, {}));
  }
  disconnectMercadoPago(): Promise<void> {
    return firstValueFrom(this.http.delete<void>(MERCADO_PAGO_URL));
  }
}
