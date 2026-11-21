import { EVENT_STATUS_LABELS, type EventDto, type EventStatus } from '@mxpro/shared';
import type { StatusTone } from '../../../shared/ui/status-badge/status-badge';

/** Cor de cada status do evento (texto sempre junto: a cor nunca é o único sinal). */
export const EVENT_STATUS: Record<EventStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: EVENT_STATUS_LABELS.DRAFT, tone: 'idle' },
  PUBLISHED: { label: EVENT_STATUS_LABELS.PUBLISHED, tone: 'ok' },
  FINISHED: { label: EVENT_STATUS_LABELS.FINISHED, tone: 'info' },
  CANCELED: { label: EVENT_STATUS_LABELS.CANCELED, tone: 'danger' },
};

/** Situação das inscrições para mostrar na lista e no detalhe. */
export function registrationBadge(event: EventDto): { label: string; tone: StatusTone } | null {
  if (event.status !== 'PUBLISHED') return null;
  if (event.registration.isOpen) return { label: 'Inscrições abertas', tone: 'ok' };
  if (event.registration.closedEarly) return { label: 'Inscrições encerradas', tone: 'idle' };
  const opensAt = event.registration.opensAt;
  if (opensAt && new Date(opensAt) > new Date()) return { label: 'Inscrições em breve', tone: 'warn' };
  if (!opensAt) return { label: 'Inscrições sem data', tone: 'warn' };
  return { label: 'Inscrições encerradas', tone: 'idle' };
}
