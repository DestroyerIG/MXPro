import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreateRegistrationRequest, CreateRegistrationResponse } from '@mxpro/shared';
import { firstValueFrom } from 'rxjs';

export const publicEventUrl = (eventId: string) => `/api/public/events/${eventId}`;
export const registrationUrl = (id: string) => `/api/registrations/${id}`;
export const MY_REGISTRATIONS_URL = '/api/me/registrations';

/** Chamadas que ALTERAM dados (inscrever, gerar Pix). As leituras ficam em `httpResource` nas telas. */
@Injectable({ providedIn: 'root' })
export class RegistrationsApi {
  private readonly http = inject(HttpClient);

  register(eventId: string, body: CreateRegistrationRequest): Promise<CreateRegistrationResponse> {
    return firstValueFrom(this.http.post<CreateRegistrationResponse>(`${publicEventUrl(eventId)}/registrations`, body));
  }
  renewPix(id: string): Promise<CreateRegistrationResponse> {
    return firstValueFrom(this.http.post<CreateRegistrationResponse>(`${registrationUrl(id)}/pix`, {}));
  }
}
