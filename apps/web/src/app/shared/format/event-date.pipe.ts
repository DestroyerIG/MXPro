import { Pipe, PipeTransform } from '@angular/core';
import { formatEventDay, formatEventTime } from './date-time';

/**
 * Pipe: transforma um valor só para exibição, direto no template.
 *   {{ heat.startsAt | eventDate: event.timeZone : 'time' }}  → "09:00"
 *   {{ event.startsAt | eventDate: event.timeZone : 'day' }}  → "Sábado, 13/03"
 *
 * Pipes são "puros" por padrão: o Angular só recalcula quando os argumentos mudam, então é
 * mais barato que chamar uma função no template (que rodaria a cada verificação da tela).
 * A lógica fica em funções comuns (date-time.ts), que também servem fora de templates.
 */
@Pipe({ name: 'eventDate' })
export class EventDatePipe implements PipeTransform {
  transform(isoUtc: string, timeZone: string, format: 'time' | 'day'): string {
    return format === 'time' ? formatEventTime(isoUtc, timeZone) : formatEventDay(isoUtc, timeZone);
  }
}
