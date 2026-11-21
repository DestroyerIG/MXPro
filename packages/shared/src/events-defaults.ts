/**
 * Eventos e campeonatos SEM depender do Zod (o front importa daqui sem levar a biblioteca de validação).
 * Tipos das respostas da API, rótulos em português e regras puras usadas pela API e pelo front.
 */

/** Modalidades do escopo (docs/arquitetura.md §4.7). */
export const MODALITIES = ['MOTOCROSS', 'ENDURO', 'ENDURO_REGULARITY', 'CROSS_COUNTRY', 'SUPERCROSS', 'CUSTOM'] as const;
export type Modality = (typeof MODALITIES)[number];
export const MODALITY_LABELS: Record<Modality, string> = {
  MOTOCROSS: 'Motocross',
  ENDURO: 'Enduro',
  ENDURO_REGULARITY: 'Enduro de regularidade',
  CROSS_COUNTRY: 'Cross Country',
  SUPERCROSS: 'Supercross/Arenacross',
  CUSTOM: 'Personalizada',
};

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'FINISHED', 'CANCELED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  FINISHED: 'Encerrado',
  CANCELED: 'Cancelado',
};

/** Unidades federativas (siglas). */
export const BRAZIL_STATES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR',
  'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;
export type BrazilState = (typeof BRAZIL_STATES)[number];

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export interface ChampionshipDto {
  id: string;
  name: string;
  season: number;
  eventCount: number;
}

export interface RegistrationWindowDto {
  /** ISO 8601 (UTC) ou null (sem data definida). */
  opensAt: string | null;
  closesAt: string | null;
  /** Fechada manualmente pelo organizador ("fechar agora"). */
  closedEarly: boolean;
  /** Calculado pela API no momento da resposta. */
  isOpen: boolean;
}

/** Evento como a API devolve (listagem e detalhe). */
export interface EventDto {
  id: string;
  name: string;
  championship: { id: string; name: string; season: number } | null;
  stageNumber: number | null;
  /** Datas do calendário, "AAAA-MM-DD" (sem hora, no fuso do evento). */
  startDate: string;
  endDate: string;
  timeZone: string;
  venue: string;
  city: string;
  state: string;
  status: EventStatus;
  registration: RegistrationWindowDto;
  categoryCount: number;
  heatCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * As inscrições estão abertas AGORA? Regra única, usada pela API (e no futuro pela página de inscrição):
 * evento publicado, não fechado manualmente, com data de abertura já atingida e antes do encerramento.
 * Sem data de abertura = ainda não abriu (o organizador precisa decidir quando abrir).
 */
export function isRegistrationOpen(
  event: { status: EventStatus; registrationOpensAt: Date | null; registrationClosesAt: Date | null; registrationClosedEarly: boolean },
  now: Date,
): boolean {
  if (event.status !== 'PUBLISHED' || event.registrationClosedEarly || !event.registrationOpensAt) return false;
  if (now < event.registrationOpensAt) return false;
  return !event.registrationClosesAt || now < event.registrationClosesAt;
}
