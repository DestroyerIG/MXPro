import { z } from 'zod';
import { BRAZIL_STATES, DEFAULT_TIME_ZONE, EVENT_STATUSES } from './events-defaults.js';

export * from './events-defaults.js';

/**
 * Validação de campeonatos e eventos (entrada da API). Mensagens em português, por campo.
 * Datas do calendário em "AAAA-MM-DD"; instantes (janela de inscrição) em ISO 8601 com fuso.
 */

const name = (max: number) =>
  z
    .string('Informe o nome.')
    .trim()
    .min(3, 'Use pelo menos 3 caracteres.')
    .max(max, `Use no máximo ${max} caracteres.`);

const text = (label: string, max: number) =>
  z
    .string(`Informe ${label}.`)
    .trim()
    .min(2, `Informe ${label}.`)
    .max(max, `Use no máximo ${max} caracteres.`);

const calendarDate = (label: string) =>
  z.iso
    // abort: data malformada já para aqui (sem um segundo erro de intervalo).
    .date({ message: `Informe ${label} no formato AAAA-MM-DD.`, abort: true })
    .refine((d) => d >= '2000-01-01' && d <= '2100-12-31', 'Use uma data entre 2000 e 2100.');

const instant = z.iso.datetime({ offset: true, message: 'Use data e hora no formato ISO 8601 (ex.: 2027-01-15T09:00:00-03:00).' });

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const championshipInputSchema = z.object({
  name: name(120),
  season: z
    .number('Informe a temporada (ano).')
    .int('Use um ano, ex.: 2027.')
    .min(2000, 'Use um ano entre 2000 e 2100.')
    .max(2100, 'Use um ano entre 2000 e 2100.'),
});
export type ChampionshipInput = z.input<typeof championshipInputSchema>;

/** Campos de um evento, sem as regras que cruzam campos (usado também como base do PATCH). */
const eventFields = {
  name: name(120),
  championshipId: z.uuid('Campeonato inválido.').nullable(),
  stageNumber: z.number('Informe o número da etapa.').int('Use um número inteiro.').min(1, 'Use 1 ou mais.').max(99, 'Use até 99.').nullable(),
  startDate: calendarDate('a data de início'),
  endDate: calendarDate('a data de término'),
  timeZone: z.string().refine(isValidTimeZone, 'Fuso horário inválido.'),
  venue: text('o local', 120),
  city: text('a cidade', 80),
  state: z.string('Informe a UF.').trim().toUpperCase().pipe(z.enum(BRAZIL_STATES, 'UF inválida.')),
  registrationOpensAt: instant.nullable(),
  registrationClosesAt: instant.nullable(),
  registrationClosedEarly: z.boolean(),
};

/** Regras entre campos: valem na criação e no resultado final de uma edição. */
function eventRules<T extends z.ZodType<{
  championshipId: string | null;
  stageNumber: number | null;
  startDate: string;
  endDate: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
}>>(schema: T) {
  return schema
    .refine((e) => e.endDate >= e.startDate, { path: ['endDate'], message: 'O término não pode ser antes do início.' })
    .refine((e) => e.stageNumber === null || e.championshipId !== null, {
      path: ['stageNumber'],
      message: 'Número de etapa só existe dentro de um campeonato.',
    })
    .refine(
      (e) =>
        !e.registrationOpensAt ||
        !e.registrationClosesAt ||
        new Date(e.registrationClosesAt) > new Date(e.registrationOpensAt),
      { path: ['registrationClosesAt'], message: 'O encerramento das inscrições precisa ser depois da abertura.' },
    );
}

/** Corpo de POST /api/events. Opcionais ganham valor padrão; o evento nasce como rascunho. */
export const createEventSchema = eventRules(
  z.object({
    ...eventFields,
    championshipId: eventFields.championshipId.default(null),
    stageNumber: eventFields.stageNumber.default(null),
    timeZone: eventFields.timeZone.default(DEFAULT_TIME_ZONE),
    registrationOpensAt: eventFields.registrationOpensAt.default(null),
    registrationClosesAt: eventFields.registrationClosesAt.default(null),
    registrationClosedEarly: eventFields.registrationClosedEarly.default(false),
  }),
);
export type CreateEventRequest = z.input<typeof createEventSchema>;
export type EventInput = z.output<typeof createEventSchema>;

/** Corpo de PATCH /api/events/:id: só os campos enviados mudam. */
// strictObject: campo desconhecido é erro (evita achar que salvou algo que a API ignorou).
export const updateEventSchema = z.strictObject(eventFields).partial();
export type UpdateEventRequest = z.input<typeof updateEventSchema>;

/** Validação do evento COMPLETO depois de aplicar a edição (as regras entre campos valem no resultado). */
export const eventSchema = eventRules(z.object(eventFields));

/** Filtros de GET /api/events. */
export const eventListQuerySchema = z.object({
  status: z.enum(EVENT_STATUSES, 'Status inválido.').optional(),
  championshipId: z.uuid('Campeonato inválido.').optional(),
});

export const cancelEventSchema = z.object({
  reason: z.string().trim().max(500, 'Use no máximo 500 caracteres.').optional(),
});
