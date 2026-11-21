/**
 * Formatação de data/hora no FUSO DO EVENTO (docs/arquitetura.md §6: UTC no banco, exibição no fuso do evento).
 * Usa Intl em vez do DatePipe do Angular porque o DatePipe só aceita deslocamento fixo ("-0300"),
 * não o nome do fuso ("America/Sao_Paulo"), que é o que guardamos no evento.
 */

const LOCALE = 'pt-BR';

// Formatadores são caros de criar; guardamos um por fuso.
const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(cache: Map<string, Intl.DateTimeFormat>, timeZone: string, options: Intl.DateTimeFormatOptions) {
  let f = cache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { timeZone, ...options });
    cache.set(timeZone, f);
  }
  return f;
}

/** "09:00" */
export function formatEventTime(isoUtc: string, timeZone: string): string {
  return formatter(timeFormatters, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(isoUtc),
  );
}

/** "Sábado, 13/03" */
export function formatEventDay(isoUtc: string, timeZone: string): string {
  const parts = formatter(dayFormatters, timeZone, { weekday: 'long', day: '2-digit', month: '2-digit' }).formatToParts(
    new Date(isoUtc),
  );
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${get('day')}/${get('month')}`;
}

// ─── Campos de formulário <input type="datetime-local"> no fuso do evento ──────────────────

/** Quanto o fuso está à frente do UTC (ms) num instante. São Paulo: -3 h. */
function offsetMs(instantMs: number, timeZone: string): number {
  const parts = formatter(offsetFormatters, timeZone, {
    hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * "2027-01-15T09:00" digitado no formulário, entendido como horário NO FUSO DO EVENTO → ISO UTC.
 * O <input type="datetime-local"> não tem fuso; sem esta conversão, o horário seria lido no fuso
 * do computador de quem digitou (errado se o organizador estiver em outro estado).
 */
export function zonedInputToIso(local: string, timeZone: string): string {
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  // Duas passadas: acerta o caso raro de o palpite cair do outro lado de uma mudança de horário.
  let instant = wallAsUtc - offsetMs(wallAsUtc, timeZone);
  instant = wallAsUtc - offsetMs(instant, timeZone);
  return new Date(instant).toISOString();
}

/** Inverso: ISO UTC → "AAAA-MM-DDTHH:mm" no fuso do evento (para preencher o campo ao editar). */
export function isoToZonedInput(iso: string, timeZone: string): string {
  const ms = new Date(iso).getTime();
  return new Date(ms + offsetMs(ms, timeZone)).toISOString().slice(0, 16);
}

/** "13/03/2027" a partir de "2027-03-13" (data do calendário, sem fuso). */
export function formatCalendarDate(calendarDate: string): string {
  return calendarDate.split('-').reverse().join('/');
}

/** Período do evento: "13/03/2027" ou "17 a 18/04/2027" ou "30/04 a 01/05/2027". */
export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatCalendarDate(start);
  const [sy, sm, sd] = start.split('-');
  const [ey, em, ed] = end.split('-');
  if (sy === ey && sm === em) return `${sd} a ${ed}/${em}/${ey}`;
  if (sy === ey) return `${sd}/${sm} a ${ed}/${em}/${ey}`;
  return `${formatCalendarDate(start)} a ${formatCalendarDate(end)}`;
}
