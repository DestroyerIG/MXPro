/**
 * Recebimento das inscrições pelo Mercado Pago do contratante (ADR 0005). Só tipos e constantes,
 * sem Zod: o front importa daqui.
 */

/** Resposta de GET /api/payments/mercadopago. */
export interface MercadoPagoConnectionDto {
  /** A API tem as credenciais do aplicativo (variáveis MP_*). Sem isso, não há como conectar. */
  configured: boolean;
  /** Conta conectada (null = nenhuma). */
  account: {
    /** Id do vendedor no Mercado Pago (aparece no painel do Mercado Pago). */
    mpUserId: string;
    /** false = conta/credenciais de teste (sandbox). */
    liveMode: boolean;
    connectedAt: string;
    connectedBy: { id: string; name: string } | null;
    /** Validade do acesso; a API renova sozinha antes de vencer. */
    expiresAt: string;
  } | null;
}

/** Resposta de POST /api/payments/mercadopago/connect: para onde levar o organizador. */
export interface MercadoPagoConnectResponse {
  authorizationUrl: string;
}

/** Resultado do retorno do OAuth, enviado à tela Financeiro em `?mercadopago=`. */
export const MP_CONNECT_RESULTS = ['conectado', 'negado', 'expirado', 'sessao', 'falha', 'nao-configurado'] as const;
export type MercadoPagoConnectResult = (typeof MP_CONNECT_RESULTS)[number];
