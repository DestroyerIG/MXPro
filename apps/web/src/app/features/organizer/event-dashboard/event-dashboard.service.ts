import { Injectable } from '@angular/core';
import { MOCK_EVENT_DASHBOARD } from './event-dashboard.mock';
import { EventDashboard, EventDashboardDto } from './event-dashboard.model';

/** Evento aberto no painel. Provisório: depois virá do seletor de evento / da URL. */
export const CURRENT_EVENT_ID = MOCK_EVENT_DASHBOARD.event.id;

/** Atraso simulado de rede, para a tela mostrar o estado "carregando" como fará com a API. */
const FAKE_LATENCY_MS = 300;

/** Regras de apresentação do painel (função pura: fácil de testar, sem Angular). */
export function toEventDashboard(dto: EventDashboardDto): EventDashboard {
  const { total, paid } = dto.registrations;
  return {
    event: dto.event,
    totals: { registered: total, paid, pending: Math.max(0, total - paid), heats: dto.heatCount },
    upcomingHeats: [...dto.upcomingHeats].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    registrationsByCategory: dto.registrationsByCategory,
  };
}

/**
 * Busca os dados do painel do evento.
 * **Hoje:** devolve os dados fictícios do escopo. **Com a API:** troca o corpo de `load` por
 * uma chamada HTTP (ou a tela passa a usar `httpResource`); o formato devolvido não muda.
 *
 * Fica na pasta da feature (e não em core/) porque só o painel usa.
 */
@Injectable({ providedIn: 'root' })
export class EventDashboardService {
  async load(eventId: string, abortSignal?: AbortSignal): Promise<EventDashboard> {
    await delay(FAKE_LATENCY_MS, abortSignal);
    if (eventId !== MOCK_EVENT_DASHBOARD.event.id) throw new Error('Evento não encontrado.');
    return toEventDashboard(MOCK_EVENT_DASHBOARD);
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });
}
