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
