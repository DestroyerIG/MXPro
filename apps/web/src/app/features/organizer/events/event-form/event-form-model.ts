import { type CreateEventRequest, DEFAULT_TIME_ZONE, type EventDto } from '@mxpro/shared';
import { isoToZonedInput, zonedInputToIso } from '../../../../shared/format/date-time';

/**
 * Modelo do formulário de evento. Tudo texto (como os campos da tela): Signal Forms não usa null,
 * e a conversão para o formato da API acontece num lugar só (`toRequest`).
 */
export interface EventFormModel {
  name: string;
  /** '' = evento avulso; NEW_CHAMPIONSHIP = criar um agora. */
  championshipId: string;
  stageNumber: string;
  startDate: string;
  endDate: string;
  timeZone: string;
  venue: string;
  city: string;
  state: string;
  /** "AAAA-MM-DDTHH:mm" no fuso do evento ('' = sem data). */
  registrationOpensAt: string;
  registrationClosesAt: string;
}

export const NEW_CHAMPIONSHIP = '__novo__';

/** Fusos do Brasil (o evento é exibido e as datas de inscrição são lidas nele). */
export const TIME_ZONES: { id: string; label: string }[] = [
  { id: 'America/Sao_Paulo', label: 'Horário de Brasília (UTC−3)' },
  { id: 'America/Manaus', label: 'AM, MT, MS, RO e RR (UTC−4)' },
  { id: 'America/Rio_Branco', label: 'Acre (UTC−5)' },
  { id: 'America/Noronha', label: 'Fernando de Noronha (UTC−2)' },
];

export const EMPTY_EVENT_FORM: EventFormModel = {
  name: '',
  championshipId: '',
  stageNumber: '',
  startDate: '',
  endDate: '',
  timeZone: DEFAULT_TIME_ZONE,
  venue: '',
  city: '',
  state: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
};

export function toFormModel(event: EventDto): EventFormModel {
  const local = (iso: string | null) => (iso ? isoToZonedInput(iso, event.timeZone) : '');
  return {
    name: event.name,
    championshipId: event.championship?.id ?? '',
    stageNumber: event.stageNumber?.toString() ?? '',
    startDate: event.startDate,
    endDate: event.endDate,
    timeZone: event.timeZone,
    venue: event.venue,
    city: event.city,
    state: event.state,
    registrationOpensAt: local(event.registration.opensAt),
    registrationClosesAt: local(event.registration.closesAt),
  };
}

/** Formulário → corpo da API (vazio vira null; horários do fuso do evento viram UTC). */
export function toRequest(m: EventFormModel): CreateEventRequest {
  const inChampionship = m.championshipId !== '' && m.championshipId !== NEW_CHAMPIONSHIP;
  const instant = (local: string) => (local ? zonedInputToIso(local, m.timeZone) : null);
  return {
    name: m.name,
    championshipId: inChampionship ? m.championshipId : null,
    stageNumber: inChampionship && m.stageNumber.trim() ? Number(m.stageNumber) : null,
    startDate: m.startDate,
    endDate: m.endDate,
    timeZone: m.timeZone,
    venue: m.venue,
    city: m.city,
    state: m.state,
    registrationOpensAt: instant(m.registrationOpensAt),
    registrationClosesAt: instant(m.registrationClosesAt),
  };
}
