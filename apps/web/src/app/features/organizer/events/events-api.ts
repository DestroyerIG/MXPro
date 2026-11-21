import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ChampionshipDto, ChampionshipInput, CreateEventRequest, EventDto, UpdateEventRequest } from '@mxpro/shared';
import { firstValueFrom } from 'rxjs';

export const EVENTS_URL = '/api/events';
export const CHAMPIONSHIPS_URL = '/api/championships';

/**
 * Chamadas da API de eventos e campeonatos usadas pelas telas do organizador.
 * As LEITURAS das telas usam `httpResource` direto no componente (estado de carregando/erro pronto);
 * este service fica com as ALTERAÇÕES, que acontecem em resposta a um clique.
 */
@Injectable({ providedIn: 'root' })
export class EventsApi {
  private readonly http = inject(HttpClient);

  create(body: CreateEventRequest): Promise<EventDto> {
    return firstValueFrom(this.http.post<EventDto>(EVENTS_URL, body));
  }
  update(id: string, body: UpdateEventRequest): Promise<EventDto> {
    return firstValueFrom(this.http.patch<EventDto>(`${EVENTS_URL}/${id}`, body));
  }
  publish(id: string): Promise<EventDto> {
    return firstValueFrom(this.http.post<EventDto>(`${EVENTS_URL}/${id}/publish`, {}));
  }
  cancel(id: string, reason: string): Promise<EventDto> {
    return firstValueFrom(this.http.post<EventDto>(`${EVENTS_URL}/${id}/cancel`, reason ? { reason } : {}));
  }
  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${EVENTS_URL}/${id}`));
  }
  createChampionship(body: ChampionshipInput): Promise<ChampionshipDto> {
    return firstValueFrom(this.http.post<ChampionshipDto>(CHAMPIONSHIPS_URL, body));
  }
}
