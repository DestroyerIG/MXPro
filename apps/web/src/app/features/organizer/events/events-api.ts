import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AddEventCategoryRequest,
  CategoryDto,
  CategoryInput,
  ChampionshipDto,
  ChampionshipInput,
  CreateEventRequest,
  CreateHeatRequest,
  EventCategoryDto,
  EventCategoryRulesDto,
  EventDto,
  HeatDto,
  SaveRulesRequest,
  UpdateEventCategoryRequest,
  UpdateEventRequest,
  UpdateHeatRequest,
} from '@mxpro/shared';
import { firstValueFrom } from 'rxjs';

export const EVENTS_URL = '/api/events';
export const CHAMPIONSHIPS_URL = '/api/championships';
export const CATEGORIES_URL = '/api/categories';
export const eventCategoriesUrl = (eventId: string) => `${EVENTS_URL}/${eventId}/categories`;
export const heatsUrl = (eventId: string) => `${EVENTS_URL}/${eventId}/heats`;
export const rulesUrl = (eventId: string, eventCategoryId: string) => `${eventCategoriesUrl(eventId)}/${eventCategoryId}/rules`;

/**
 * Chamadas da API de eventos, campeonatos, categorias e baterias usadas pelas telas do organizador.
 * As LEITURAS das telas usam `httpResource` direto no componente (estado de carregando/erro pronto);
 * este service fica com as ALTERAÇÕES, que acontecem em resposta a um clique.
 */
@Injectable({ providedIn: 'root' })
export class EventsApi {
  private readonly http = inject(HttpClient);

  // ─── Eventos ───
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

  // ─── Catálogo de categorias ───
  createCategory(body: CategoryInput): Promise<CategoryDto> {
    return firstValueFrom(this.http.post<CategoryDto>(CATEGORIES_URL, body));
  }
  updateCategory(id: string, body: Partial<CategoryInput> & { active?: boolean }): Promise<CategoryDto> {
    return firstValueFrom(this.http.patch<CategoryDto>(`${CATEGORIES_URL}/${id}`, body));
  }
  deleteCategory(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${CATEGORIES_URL}/${id}`));
  }

  // ─── Categorias do evento ───
  addEventCategory(eventId: string, body: AddEventCategoryRequest): Promise<EventCategoryDto> {
    return firstValueFrom(this.http.post<EventCategoryDto>(eventCategoriesUrl(eventId), body));
  }
  updateEventCategory(eventId: string, id: string, body: UpdateEventCategoryRequest): Promise<EventCategoryDto> {
    return firstValueFrom(this.http.patch<EventCategoryDto>(`${eventCategoriesUrl(eventId)}/${id}`, body));
  }
  removeEventCategory(eventId: string, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${eventCategoriesUrl(eventId)}/${id}`));
  }

  // ─── Regras da prova da categoria ───
  saveRules(eventId: string, eventCategoryId: string, body: SaveRulesRequest): Promise<EventCategoryRulesDto> {
    return firstValueFrom(this.http.put<EventCategoryRulesDto>(rulesUrl(eventId, eventCategoryId), body));
  }

  // ─── Baterias ───
  createHeat(eventId: string, body: CreateHeatRequest): Promise<HeatDto> {
    return firstValueFrom(this.http.post<HeatDto>(heatsUrl(eventId), body));
  }
  updateHeat(eventId: string, id: string, body: UpdateHeatRequest): Promise<HeatDto> {
    return firstValueFrom(this.http.patch<HeatDto>(`${heatsUrl(eventId)}/${id}`, body));
  }
  deleteHeat(eventId: string, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${heatsUrl(eventId)}/${id}`));
  }
}
