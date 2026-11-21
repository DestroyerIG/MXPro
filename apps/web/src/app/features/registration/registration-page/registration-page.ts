import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormField as SignalFormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { type PublicEventDto, RACE_NUMBER_PATTERN } from '@mxpro/shared';
import { SessionService } from '../../../core/auth/session.service';
import { toApiProblem } from '../../../core/http/api-problem';
import { formatDateRange, formatEventDay, formatEventTime } from '../../../shared/format/date-time';
import { formatBrl } from '../../../shared/format/money';
import { Button } from '../../../shared/ui/button/button';
import { Control, FormField } from '../../../shared/ui/form-field/form-field';
import { LEGAL_PROVISIONAL, LIABILITY_WAIVER, PRIVACY_POLICY } from '../legal-texts';
import { PilotFrame } from '../pilot-frame/pilot-frame';
import { RegistrationsApi, publicEventUrl } from '../registration-api';

interface RegistrationFormModel {
  // Conta (só na primeira inscrição; quem já entrou não vê estes campos).
  name: string;
  email: string;
  password: string;
  acceptPrivacy: boolean;
  // Inscrição (PDF, página 5).
  eventCategoryId: string;
  raceNumber: string;
  bike: string;
  team: string;
  acceptWaiver: boolean;
}
type FieldName = keyof RegistrationFormModel;

const EMPTY: RegistrationFormModel = {
  name: '',
  email: '',
  password: '',
  acceptPrivacy: false,
  eventCategoryId: '',
  raceNumber: '',
  bike: '',
  team: '',
  acceptWaiver: false,
};

/** Campo da API ("account.email") → campo do formulário. */
const SERVER_FIELDS: Record<string, FieldName> = {
  'account.name': 'name',
  'account.email': 'email',
  'account.password': 'password',
  'account.acceptPrivacy': 'acceptPrivacy',
  account: 'email',
  eventCategoryId: 'eventCategoryId',
  raceNumber: 'raceNumber',
  bike: 'bike',
  team: 'team',
  acceptWaiver: 'acceptWaiver',
};

const fail = (message: string) => ({ kind: 'registration', message });

/**
 * Inscrição pelo celular (/inscricao/:eventId), página PÚBLICA: o link que a organização divulga.
 * Quem ainda não tem conta cria aqui mesmo (nome, e-mail e senha); quem já tem entra antes.
 * Ao enviar, a API reserva a vaga e o número por 30 min e gera o Pix; seguimos para o pagamento.
 */
@Component({
  selector: 'app-registration-page',
  imports: [RouterLink, SignalFormField, FormField, Control, Button, PilotFrame],
  templateUrl: './registration-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationPage {
  private readonly api = inject(RegistrationsApi);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);

  /** :eventId da rota. */
  readonly eventId = input.required<string>();

  protected readonly event = httpResource<PublicEventDto>(() => publicEventUrl(this.eventId()));
  /** Valor ou undefined (com o recurso em erro, `value()` lança exceção: o Angular força tratar o erro). */
  private readonly loaded = computed(() => (this.event.hasValue() ? this.event.value() : undefined));

  protected readonly user = this.session.user;
  protected readonly isPilot = computed(() => this.user()?.role === 'PILOT');
  protected readonly isStaff = computed(() => !!this.user() && !this.isPilot());
  /** Sem login: a inscrição cria a conta. */
  protected readonly needsAccount = computed(() => !this.user());
  protected readonly loginLink = computed(() => ({ voltar: `/inscricao/${this.eventId()}` }));

  protected readonly heading = computed(() => (this.loaded() ? `${this.loaded()!.name} - Inscrição` : 'Inscrição'));
  protected readonly period = computed(() => {
    const e = this.loaded();
    return e ? formatDateRange(e.startDate, e.endDate) : '';
  });
  /** "Inscrições abrem sábado, 15/01 às 09:00" quando ainda não abriram. */
  protected readonly closedMessage = computed(() => {
    const e = this.loaded();
    if (!e || e.registration.isOpen) return null;
    const opens = e.registration.opensAt;
    if (opens && new Date(opens) > new Date()) {
      return `As inscrições abrem ${formatEventDay(opens, e.timeZone).toLowerCase()} às ${formatEventTime(opens, e.timeZone)}.`;
    }
    return 'As inscrições deste evento estão encerradas.';
  });

  protected readonly categories = computed(() =>
    (this.loaded()?.categories ?? []).map((c) => ({
      ...c,
      soldOut: c.spotsLeft === 0,
      label: `${c.name} - ${formatBrl(c.entryFeeCents)}${c.spotsLeft === 0 ? ' (esgotada)' : ''}`,
    })),
  );

  protected readonly model = signal<RegistrationFormModel>({ ...EMPTY });
  protected readonly selected = computed(() => this.categories().find((c) => c.id === this.model().eventCategoryId) ?? null);

  protected readonly registrationForm = form(this.model, (p) => {
    required(p.eventCategoryId, { message: 'Escolha a categoria.' });
    validate(p.raceNumber, ({ value }) => (RACE_NUMBER_PATTERN.test(value().trim()) ? undefined : fail('Use de 1 a 3 dígitos (ex.: 27 ou 05).')));
    validate(p.bike, ({ value }) => (value().trim().length >= 2 ? undefined : fail('Informe a moto (ex.: Honda CRF 250F).')));
    maxLength(p.raceNumber, 3, { message: 'Use de 1 a 3 dígitos (ex.: 27 ou 05).' });
    maxLength(p.bike, 60, { message: 'Use no máximo 60 caracteres.' });
    maxLength(p.team, 60, { message: 'Use no máximo 60 caracteres.' });
    validate(p.acceptWaiver, ({ value }) => (value() ? undefined : fail('Aceite o termo de responsabilidade para continuar.')));
    // Conta: só vale para quem não entrou.
    validate(p.name, ({ value }) =>
      this.needsAccount() && value().trim().split(/\s+/).filter(Boolean).length < 2 ? fail('Informe o nome completo (nome e sobrenome).') : undefined,
    );
    validate(p.email, ({ value }) =>
      this.needsAccount() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value().trim()) ? fail('Informe um e-mail válido.') : undefined,
    );
    validate(p.password, ({ value }) => (this.needsAccount() && value().length < 8 ? fail('Use pelo menos 8 caracteres na senha.') : undefined));
    validate(p.acceptPrivacy, ({ value }) =>
      this.needsAccount() && !value() ? fail('Aceite a política de privacidade para criar a conta.') : undefined,
    );
  });

  protected readonly legal = { waiver: LIABILITY_WAIVER, privacy: PRIVACY_POLICY, provisional: LEGAL_PROVISIONAL };

  // ─── Erros vindos da API: somem quando o piloto muda o valor recusado ───
  private readonly serverErrors = signal<Partial<Record<FieldName, string>>>({});
  private readonly rejected = signal<RegistrationFormModel | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected fieldError(name: FieldName): string | null {
    const rejected = this.rejected();
    const server = rejected && rejected[name] === this.model()[name] ? this.serverErrors()[name] : undefined;
    const state = this.registrationForm[name]();
    if (!state.touched()) return server ?? null;
    return state.errors()[0]?.message ?? server ?? null;
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.error.set(null);
    void submit(this.registrationForm, async () => {
      const m = this.model();
      const creatingAccount = this.needsAccount();
      this.busy.set(true);
      try {
        const { registration } = await this.api.register(this.eventId(), {
          eventCategoryId: m.eventCategoryId,
          raceNumber: m.raceNumber.trim(),
          bike: m.bike.trim(),
          team: m.team.trim() || undefined,
          acceptWaiver: true,
          ...(creatingAccount
            ? { account: { name: m.name.trim(), email: m.email.trim(), password: m.password, acceptPrivacy: true as const } }
            : {}),
        });
        // A API já abriu a sessão da conta nova (cookie); o app precisa saber quem entrou.
        if (creatingAccount) await this.session.refresh();
        await this.router.navigate(['/minhas-inscricoes', registration.id]);
      } catch (err) {
        const problem = toApiProblem(err);
        const fields: Partial<Record<FieldName, string>> = {};
        for (const [path, message] of Object.entries(problem.fields)) {
          const field = SERVER_FIELDS[path];
          if (field && !fields[field]) fields[field] = message;
        }
        this.serverErrors.set(fields);
        this.rejected.set(m);
        // Recusa sem campo (vaga esgotada, inscrição repetida…) aparece junto do botão.
        this.error.set(Object.keys(fields).length ? 'Confira os campos destacados.' : problem.message);
        if (Object.keys(fields).length === 0) this.event.reload(); // ex.: vagas mudaram
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }
}
