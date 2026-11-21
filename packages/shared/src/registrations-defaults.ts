import type { Modality } from './events-defaults.js';

/**
 * Inscrições (ADR 0004): tipos e constantes SEM Zod (o front importa daqui; a validação da entrada
 * fica em registrations.ts).
 */

export const REGISTRATION_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELED'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Confirmada',
  EXPIRED: 'Prazo de pagamento vencido',
  CANCELED: 'Cancelada',
};

/** Versão dos textos aceitos (política de privacidade e termo de responsabilidade). */
export const CONSENT_DOCUMENT_VERSION = '2026-11';

/** Nº de largada: 1 a 3 dígitos, como TEXTO ("05" e "5" são placas diferentes). */
export const RACE_NUMBER_PATTERN = /^[0-9]{1,3}$/;

/** Página pública do evento (sem login): só o necessário para se inscrever. Nenhum dado pessoal. */
export interface PublicEventDto {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  timeZone: string;
  venue: string;
  city: string;
  state: string;
  registration: { isOpen: boolean; opensAt: string | null; closesAt: string | null };
  categories: PublicEventCategoryDto[];
}

export interface PublicEventCategoryDto {
  /** Id da categoria DO EVENTO (é ele que vai na inscrição). */
  id: string;
  name: string;
  description: string | null;
  modality: Modality;
  entryFeeCents: number;
  /** Vagas restantes (null = sem limite). Reservas aguardando Pix contam como ocupadas. */
  spotsLeft: number | null;
}

/** Pix em aberto de uma inscrição. */
export interface PixChargeDto {
  paymentId: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'REFUNDED' | 'CANCELED';
  amountCents: number;
  /** Pix "copia e cola"; o QR Code é desenhado a partir dele. */
  pixCopyPaste: string;
  expiresAt: string;
}

/** Inscrição vista pelo próprio piloto (e pela equipe). */
export interface RegistrationDto {
  id: string;
  event: { id: string; name: string; startDate: string; timeZone: string };
  category: { id: string; name: string };
  raceNumber: string;
  bike: string;
  team: string | null;
  status: RegistrationStatus;
  entryFeeCents: number;
  /** Até quando a vaga fica reservada aguardando o Pix. */
  holdExpiresAt: string | null;
  confirmedAt: string | null;
  /** Pix em aberto (null se não houver: confirmada, vencida ou gratuita). */
  pix: PixChargeDto | null;
  /**
   * Algum Pix desta inscrição foi pago. Com status EXPIRED, é o caso "pago sem vaga" (pagou depois
   * de a reserva vencer e a vaga ou o número já tinham sido ocupados): a organização resolve.
   */
  paymentReceived: boolean;
}

/** Resposta da inscrição: a inscrição e, se o Pix não pôde ser gerado agora, o motivo (dá para tentar de novo). */
export interface CreateRegistrationResponse {
  registration: RegistrationDto;
  pixError: string | null;
}
