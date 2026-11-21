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

// ─── Categorias e baterias ────────────────────────────────────────────────────────────────

export const HEAT_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CANCELED'] as const;
export type HeatStatus = (typeof HEAT_STATUSES)[number];
export const HEAT_STATUS_LABELS: Record<HeatStatus, string> = {
  SCHEDULED: 'Programada',
  IN_PROGRESS: 'Em prova',
  FINISHED: 'Encerrada',
  CANCELED: 'Cancelada',
};

/** Categoria do catálogo (MX1, MX2…). */
export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  /** Em quantos eventos ela é disputada (categoria em uso não é excluída, é desativada). */
  eventCount: number;
}

/** Categoria disputada num evento. */
export interface EventCategoryDto {
  id: string;
  eventId: string;
  category: { id: string; name: string };
  modality: Modality;
  /** Valor da inscrição em centavos. */
  entryFeeCents: number;
  /** Limite de inscritos; null = sem limite. */
  maxEntries: number | null;
  heatCount: number;
}

export interface HeatDto {
  id: string;
  eventId: string;
  name: string;
  /** ISO 8601 (UTC) ou null (horário a definir). */
  scheduledAt: string | null;
  status: HeatStatus;
  /** Categorias que largam nesta bateria (uma ou mais). */
  categories: { eventCategoryId: string; categoryId: string; name: string }[];
}

/**
 * Dia do calendário ("AAAA-MM-DD") de um instante, no fuso do evento.
 * Ex.: 2027-03-14T01:00Z em São Paulo ainda é 13/03 (22:00).
 */
export function calendarDateIn(instant: Date, timeZone: string): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}
