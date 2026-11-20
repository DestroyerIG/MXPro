import { Injectable, signal } from '@angular/core';

/** Perfis do sistema (docs/arquitetura.md §1). A autorização real fica no backend; aqui é só para a interface. */
export type Role = 'ORGANIZER' | 'SECRETARY' | 'TIMEKEEPER' | 'PILOT';

export const ROLE_LABELS: Record<Role, string> = {
  ORGANIZER: 'Organizador',
  SECRETARY: 'Secretaria',
  TIMEKEEPER: 'Cronometrista',
  PILOT: 'Piloto',
};

export interface SessionUser {
  name: string;
  role: Role;
}

/**
 * Sessão do usuário logado. **Provisório:** devolve um organizador fictício até existir a API de
 * autenticação (fase 1 do roadmap). Quem consome já lê um signal, então trocar a origem dos dados
 * depois não muda as telas.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly _user = signal<SessionUser | null>({ name: 'Marina Duarte', role: 'ORGANIZER' });
  readonly user = this._user.asReadonly();
}
