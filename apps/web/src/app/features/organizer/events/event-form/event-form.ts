import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import {
  FormField as SignalFormField,
  disabled,
  form,
  max,
  min,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { BRAZIL_STATES, type ChampionshipDto, type EventDto } from '@mxpro/shared';
import { SessionService } from '../../../../core/auth/session.service';
import { toApiProblem } from '../../../../core/http/api-problem';
import { formatDateRange } from '../../../../shared/format/date-time';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { Control, FormField } from '../../../../shared/ui/form-field/form-field';
import { StatusBadge } from '../../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { CHAMPIONSHIPS_URL, EVENTS_URL, EventsApi } from '../events-api';
import { EVENT_STATUS, registrationBadge } from '../event-status';
import {
  EMPTY_EVENT_FORM,
  type EventFormModel,
  NEW_CHAMPIONSHIP,
  TIME_ZONES,
  toFormModel,
  toRequest,
} from './event-form-model';

type FieldName = keyof EventFormModel;

/**
 * Criar (/painel/eventos/novo) e editar (/painel/eventos/:id) um evento, com as ações do ciclo de
 * vida: publicar, fechar/reabrir inscrições, cancelar e excluir. Secretaria vê tudo, sem editar.
 */
@Component({
  selector: 'app-event-form',
  imports: [RouterLink, SignalFormField, FormField, Control, Button, Card, StatusBadge, ConfirmDialog],
  templateUrl: './event-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventForm {
  private readonly api = inject(EventsApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly session = inject(SessionService);

  /** `:id` da URL (withComponentInputBinding). Ausente = evento novo. */
  readonly id = input<string>();
  protected readonly isNew = computed(() => !this.id());

  /** Retornar `undefined` na função do httpResource = não buscar (evento novo). */
  protected readonly event = httpResource<EventDto>(() => (this.id() ? `${EVENTS_URL}/${this.id()}` : undefined));
  protected readonly championships = httpResource<{ championships: ChampionshipDto[] }>(() => CHAMPIONSHIPS_URL);

  protected readonly canEdit = computed(() => this.session.user()?.role === 'ORGANIZER');
  /** Encerrado/cancelado: só leitura (a API também recusa alterações). */
  protected readonly locked = computed(() => ['CANCELED', 'FINISHED'].includes(this.event.value()?.status ?? ''));
  protected readonly readOnly = computed(() => !this.canEdit() || this.locked());

  /**
   * linkedSignal: signal GRAVÁVEL que se reinicia quando a fonte muda. O formulário começa com o
   * evento carregado da API; o usuário edita à vontade; quando a API devolve o evento salvo, o
   * formulário volta a mostrar o que está no banco (já normalizado: UF maiúscula, espaços…).
   */
  protected readonly model = linkedSignal<EventFormModel>(() => {
    const e = this.event.value();
    return e ? toFormModel(e) : { ...EMPTY_EVENT_FORM };
  });

  protected readonly eventForm = form(this.model, (p) => {
    // disabled (e não readonly): readonly não vale para <select>, que continuaria trocando de opção.
    disabled(p, { when: () => this.readOnly() });
    required(p.name, { message: 'Informe o nome.' });
    required(p.startDate, { message: 'Informe a data de início.' });
    required(p.endDate, { message: 'Informe a data de término.' });
    required(p.venue, { message: 'Informe o local.' });
    required(p.city, { message: 'Informe a cidade.' });
    required(p.state, { message: 'Escolha a UF.' });
    // Etapa só faz sentido dentro de um campeonato.
    disabled(p.stageNumber, { when: ({ valueOf }) => ['', NEW_CHAMPIONSHIP].includes(valueOf(p.championshipId)) });
    pattern(p.stageNumber, /^\d{0,2}$/, { message: 'Use um número de 1 a 99.' });
    validate(p.endDate, ({ value, valueOf }) =>
      value() && valueOf(p.startDate) && value() < valueOf(p.startDate)
        ? { kind: 'dateOrder', message: 'O término não pode ser antes do início.' }
        : undefined,
    );
    validate(p.registrationClosesAt, ({ value, valueOf }) =>
      value() && valueOf(p.registrationOpensAt) && value() <= valueOf(p.registrationOpensAt)
        ? { kind: 'windowOrder', message: 'O encerramento precisa ser depois da abertura.' }
        : undefined,
    );
  });

  // ─── Novo campeonato, criado sem sair da tela ───
  protected readonly championshipModel = signal({ name: '', season: new Date().getFullYear() + 1 });
  protected readonly championshipForm = form(this.championshipModel, (p) => {
    required(p.name, { message: 'Informe o nome do campeonato.' });
    min(p.season, 2000, { message: 'Use um ano entre 2000 e 2100.' });
    max(p.season, 2100, { message: 'Use um ano entre 2000 e 2100.' });
  });
  protected readonly creatingChampionship = computed(() => this.model().championshipId === NEW_CHAMPIONSHIP);
  protected readonly championshipError = signal<string | null>(null);

  // ─── Erros vindos da API ───
  /** Mensagens por campo devolvidas pela API (ex.: "Este campeonato já tem a etapa 2."). */
  private readonly serverErrors = signal<Partial<Record<FieldName, string>>>({});
  protected readonly formError = signal<string | null>(null);
  /** Erro de uma ação do ciclo de vida (publicar, cancelar…), mostrado junto dos botões de ação. */
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly states = BRAZIL_STATES;
  protected readonly timeZones = TIME_ZONES;
  protected readonly NEW_CHAMPIONSHIP = NEW_CHAMPIONSHIP;
  protected readonly status = computed(() => {
    const e = this.event.value();
    return e ? EVENT_STATUS[e.status] : null;
  });
  protected readonly registration = computed(() => {
    const e = this.event.value();
    return e ? registrationBadge(e) : null;
  });
  protected readonly period = computed(() => {
    const e = this.event.value();
    return e ? formatDateRange(e.startDate, e.endDate) : '';
  });
  /** Excluir de vez só rascunho vazio; os demais são cancelados (regra da API). */
  protected readonly deletable = computed(() => {
    const e = this.event.value();
    return !!e && e.status === 'DRAFT' && e.categoryCount === 0 && e.heatCount === 0;
  });
  protected readonly cancelReason = signal('');

  /** Erro a mostrar num campo: o da API (se houver) ou o da validação local depois de tocado. */
  protected fieldError(name: FieldName): string | null {
    const server = this.serverErrors()[name];
    if (server) return server;
    const state = this.eventForm[name]();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected championshipFieldError(name: 'name' | 'season'): string | null {
    const state = this.championshipForm[name]();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected onSubmit(e: Event): void {
    e.preventDefault();
    this.serverErrors.set({});
    this.formError.set(null);
    void submit(this.eventForm, async () => {
      if (this.creatingChampionship()) {
        this.formError.set('Crie o campeonato (ou escolha outro) antes de salvar o evento.');
        return undefined;
      }
      await this.run('form', async () => {
        const body = toRequest(this.model());
        const id = this.id();
        if (id) {
          this.event.set(await this.api.update(id, body));
          this.toasts.show('Alterações salvas.', { tone: 'ok' });
        } else {
          const created = await this.api.create(body);
          this.toasts.show('Evento criado como rascunho.', { tone: 'ok' });
          await this.router.navigate(['/painel/eventos', created.id]);
        }
      });
      return undefined;
    });
  }

  protected createChampionship(): void {
    this.championshipError.set(null);
    void submit(this.championshipForm, async () => {
      try {
        const created = await this.api.createChampionship(this.championshipModel());
        this.championships.reload();
        this.model.update((m) => ({ ...m, championshipId: created.id }));
        this.toasts.show(`Campeonato "${created.name} ${created.season}" criado.`, { tone: 'ok' });
      } catch (err) {
        const problem = toApiProblem(err);
        this.championshipError.set(problem.fields['name'] ?? problem.message);
      }
      return undefined;
    });
  }

  protected publish(): Promise<void> {
    return this.act((id) => this.api.publish(id), 'Evento publicado.');
  }
  protected setRegistrationClosed(closed: boolean): Promise<void> {
    return this.act(
      (id) => this.api.update(id, { registrationClosedEarly: closed }),
      closed ? 'Inscrições encerradas.' : 'Inscrições reabertas.',
    );
  }
  protected cancelEvent(): Promise<void> {
    return this.act((id) => this.api.cancel(id, this.cancelReason().trim()), 'Evento cancelado.');
  }
  protected async deleteEvent(): Promise<void> {
    const id = this.id();
    if (!id) return;
    await this.run('action', async () => {
      await this.api.remove(id);
      this.toasts.show('Evento excluído.', { tone: 'ok' });
      await this.router.navigateByUrl('/painel/eventos');
    });
  }

  /** Ação do ciclo de vida: chama a API e mostra o evento atualizado. */
  private async act(call: (id: string) => Promise<EventDto>, success: string): Promise<void> {
    const id = this.id();
    if (!id) return;
    await this.run('action', async () => {
      this.event.set(await call(id));
      this.toasts.show(success, { tone: 'ok' });
    });
  }

  /**
   * Executa uma chamada mostrando "ocupado" e traduzindo erros da API para a tela.
   * O erro aparece perto de onde a pessoa clicou: no formulário ou junto dos botões de ação.
   */
  private async run(where: 'form' | 'action', work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.formError.set(null);
    this.actionError.set(null);
    try {
      await work();
    } catch (err) {
      const problem = toApiProblem(err);
      if (where === 'form') {
        this.serverErrors.set(problem.fields as Partial<Record<FieldName, string>>);
        this.formError.set(problem.message);
      } else {
        this.actionError.set(problem.message);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
