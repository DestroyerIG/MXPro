import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormField as SignalFormField, applyEach, disabled, form, submit, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { MOTOCROSS_TEMPLATE, START_LABELS, START_TYPES, TIEBREAKS, TIEBREAK_LABELS } from '@mxpro/rules-engine';
import {
  type EventCategoryDto,
  type EventCategoryRulesDto,
  type EventDto,
  MODALITIES,
  MODALITY_LABELS,
  type Modality,
  type RulesVersionDto,
} from '@mxpro/shared';
import { SessionService } from '../../../../core/auth/session.service';
import { toApiProblem } from '../../../../core/http/api-problem';
import { formatEventDay, formatEventTime } from '../../../../shared/format/date-time';
import { parseRaceTime } from '../../../../shared/format/race-time';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { Control, FormField } from '../../../../shared/ui/form-field/form-field';
import { StatusBadge } from '../../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { EVENTS_URL, EventsApi, eventCategoriesUrl, rulesUrl } from '../events-api';
import {
  type RulesFormModel,
  SERVER_FIELD_MAP,
  parseCount,
  parseDuration,
  parseSeconds,
  toConfig,
  toFormModel,
} from './rules-form-model';

type FieldName = keyof RulesFormModel;

/** Cartões de "Modelo de prova" (PDF, página 4). Só o Motocross já tem regras no motor. */
const MODEL_CARDS: { modality: Modality; label: string }[] = MODALITIES.map((modality) => ({
  modality,
  label: { ENDURO_REGULARITY: 'Enduro Regul.', SUPERCROSS: 'Supercross' }[modality as string] ?? MODALITY_LABELS[modality],
}));
const SUPPORTED: ReadonlySet<Modality> = new Set(['MOTOCROSS']);

const FINISH_OPTIONS = [
  { id: 'TIME_PLUS_LAPS', label: 'Tempo + voltas' },
  { id: 'FIXED_LAPS', label: 'Número fixo de voltas' },
] as const;

/** Erro de validação no formato do Signal Forms (o `kind` identifica a regra). */
const fail = (message: string) => ({ kind: 'rules', message });

/** Inteiro entre min e max, ou a mensagem de erro. */
function countError(text: string, min: number, max: number, what: string): string | undefined {
  const n = parseCount(text);
  if (n === null) return `Use um número inteiro de ${what}.`;
  if (n < min) return `Use pelo menos ${min}.`;
  if (n > max) return `Use no máximo ${max}.`;
  return undefined;
}

/**
 * Regras da prova de UMA categoria do evento (PDF, página 4: "Configuração da prova").
 * Rota: /painel/eventos/:id/categorias/:eventCategoryId/regras.
 *
 * Os dois parâmetros da URL chegam como `input()` (withComponentInputBinding). Quando o
 * organizador troca de categoria pelos atalhos do topo, só o input muda: o `httpResource` das
 * regras busca a nova categoria e o formulário (um `linkedSignal`) se refaz a partir dela.
 */
@Component({
  selector: 'app-category-rules',
  imports: [RouterLink, SignalFormField, FormField, Control, Button, Card, StatusBadge],
  templateUrl: './category-rules.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryRules {
  private readonly api = inject(EventsApi);
  private readonly toasts = inject(ToastService);
  private readonly session = inject(SessionService);

  /** :id da rota (evento). */
  readonly id = input.required<string>();
  /** :eventCategoryId da rota (categoria DO EVENTO, com modalidade, valor e regras). */
  readonly eventCategoryId = input.required<string>();

  protected readonly event = httpResource<EventDto>(() => `${EVENTS_URL}/${this.id()}`);
  protected readonly categories = httpResource<{ categories: EventCategoryDto[] }>(() => eventCategoriesUrl(this.id()));
  protected readonly rules = httpResource<EventCategoryRulesDto>(() => rulesUrl(this.id(), this.eventCategoryId()));

  protected readonly category = computed(() =>
    this.categories.value()?.categories.find((c) => c.id === this.eventCategoryId()),
  );
  protected readonly modalityLabel = computed(() => {
    const c = this.category();
    return c ? MODALITY_LABELS[c.modality] : '';
  });

  protected readonly canEdit = computed(() => this.session.user()?.role === 'ORGANIZER');
  protected readonly locked = computed(() => ['CANCELED', 'FINISHED'].includes(this.event.value()?.status ?? ''));
  protected readonly frozen = computed(() => this.rules.value()?.frozen ?? false);
  protected readonly readOnly = computed(() => !this.canEdit() || this.locked() || !this.rules.value()?.supported);

  protected readonly modelCards = MODEL_CARDS.map((c) => ({ ...c, ready: SUPPORTED.has(c.modality) }));
  protected readonly startOptions = START_TYPES.map((id) => ({ id, label: START_LABELS[id] }));
  protected readonly finishOptions = FINISH_OPTIONS;
  protected readonly tiebreakOptions = TIEBREAKS.map((id) => ({ id, label: TIEBREAK_LABELS[id] }));

  /**
   * O formulário parte da configuração em vigor. `linkedSignal`: é um signal GRAVÁVEL (o
   * formulário escreve nele a cada tecla) que volta a ser calculado quando a fonte muda —
   * ao abrir outra categoria ou quando o salvar devolve a versão nova.
   */
  protected readonly model = linkedSignal<RulesFormModel>(() => toFormModel(this.rules.value()?.config ?? MOTOCROSS_TEMPLATE));

  protected readonly rulesForm = form(this.model, (p) => {
    disabled(p, { when: () => this.readOnly() });
    const timed = () => this.model().finishType === 'TIME_PLUS_LAPS';

    validate(p.duration, ({ value }) => {
      if (!timed()) return undefined;
      const ms = parseDuration(value());
      if (ms === null) return fail('Use minutos, ex.: 20 (ou 20:30).');
      if (ms < 60_000) return fail('Use pelo menos 1 minuto.');
      return ms > 180 * 60_000 ? fail('Use no máximo 3 horas.') : undefined;
    });
    validate(p.extraLaps, ({ value }) => {
      const message = timed() ? countError(value(), 0, 10, 'voltas') : undefined;
      return message ? fail(message) : undefined;
    });
    validate(p.laps, ({ value }) => {
      const message = timed() ? undefined : countError(value(), 1, 200, 'voltas');
      return message ? fail(message) : undefined;
    });
    validate(p.heatsPerCategory, ({ value }) => {
      const message = countError(value(), 1, 10, 'baterias');
      return message ? fail(message) : undefined;
    });
    validate(p.minLap, ({ value }) => {
      const ms = parseRaceTime(value());
      if (ms === null) return fail('Use minutos:segundos.milésimos, ex.: 0:45.000.');
      return ms > 30 * 60_000 ? fail('Use no máximo 30 minutos.') : undefined;
    });
    validate(p.penalty, ({ value }) => {
      const ms = parseSeconds(value());
      if (ms === null) return fail('Use segundos, ex.: 10 ou 2,5.');
      return ms > 600_000 ? fail('Use no máximo 600 segundos (10 minutos).') : undefined;
    });
    validate(p.minLeaderLapsPct, ({ value }) => {
      const message = countError(value(), 0, 100, 'por cento');
      return message ? fail(message) : undefined;
    });
    // applyEach: a mesma regra para cada posição da tabela de pontos.
    applyEach(p.points, (position) => {
      validate(position, ({ value }) => {
        const n = parseCount(value());
        return n === null || n > 1000 ? fail('Use de 0 a 1000.') : undefined;
      });
    });
    // Regra da tabela inteira: um 2º lugar nunca vale mais que o 1º.
    validate(p.points, ({ value }) => {
      const pts = value().map(parseCount);
      if (pts.some((n) => n === null)) return undefined;
      return pts.every((n, i) => i === 0 || n! <= pts[i - 1]!)
        ? undefined
        : fail('Cada posição deve valer o mesmo ou menos que a anterior.');
    });
    validate(p.reason, ({ value }) => {
      const text = value().trim();
      if (this.frozen() && text.length < 5) return fail('A categoria já largou: informe o motivo da mudança (ao menos 5 caracteres).');
      return text.length > 500 ? fail('Use no máximo 500 caracteres.') : undefined;
    });
  });

  /** Tabela de pontos em duas colunas (1º–10º | 11º–20º): a lista desce coluna a coluna. */
  protected readonly pointsRows = computed(() => Math.ceil(this.model().points.length / 2));

  // ─── Erros que vieram da API ───
  private readonly serverErrors = signal<Partial<Record<FieldName, string>>>({});
  /** Valores recusados: o erro do servidor some assim que o organizador muda algo. */
  private readonly rejected = signal<string | null>(null);
  private readonly unchangedSinceRejection = computed(() => this.rejected() === JSON.stringify(this.model()));

  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected fieldError(name: FieldName): string | null {
    const server = this.unchangedSinceRejection() ? this.serverErrors()[name] : undefined;
    const state = this.rulesForm[name]();
    if (!state.touched()) return server ?? null;
    return state.errors()[0]?.message ?? server ?? null;
  }

  protected pointError(index: number): string | null {
    const state = this.rulesForm.points[index]?.();
    return state?.touched() ? (state.errors()[0]?.message ?? null) : null;
  }

  /** "sábado, 21/11 às 10:32 por Marina Duarte" no fuso do evento. */
  protected versionLine(v: RulesVersionDto): string {
    const tz = this.event.value()?.timeZone ?? 'America/Sao_Paulo';
    const who = v.createdBy ? ` por ${v.createdBy.name}` : '';
    return `${formatEventDay(v.updatedAt, tz).toLowerCase()} às ${formatEventTime(v.updatedAt, tz)}${who}`;
  }

  protected addPosition(): void {
    this.model.update((m) => {
      const last = parseCount(m.points.at(-1) ?? '') ?? 1;
      return { ...m, points: [...m.points, String(Math.max(0, last - 1))] };
    });
  }

  protected removeLastPosition(): void {
    this.model.update((m) => (m.points.length > 1 ? { ...m, points: m.points.slice(0, -1) } : m));
  }

  /** Volta aos valores do modelo pronto (só no formulário; vale ao salvar). */
  protected restoreTemplate(): void {
    this.model.update((m) => ({ ...toFormModel(MOTOCROSS_TEMPLATE), reason: m.reason }));
    this.toasts.show('Valores do modelo pronto aplicados. Salve para usar.', { tone: 'info' });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.error.set(null);
    void submit(this.rulesForm, async () => {
      const config = toConfig(this.model());
      if (!config) return undefined;
      const reason = this.model().reason.trim();
      const name = this.category()?.category.name ?? 'categoria';
      this.busy.set(true);
      try {
        const saved = await this.api.saveRules(this.id(), this.eventCategoryId(), reason ? { config, reason } : { config });
        // A resposta já é o estado novo: grava no resource sem buscar de novo. O linkedSignal
        // refaz o formulário a partir dela (e o motivo volta a ficar em branco).
        this.rules.set(saved);
        this.rulesForm().reset();
        this.serverErrors.set({});
        this.toasts.show(
          this.frozen() ? `${name}: versão ${saved.current?.version} das regras salva.` : `${name}: regras salvas.`,
          { tone: 'ok' },
        );
      } catch (err) {
        const problem = toApiProblem(err);
        const fields: Partial<Record<FieldName, string>> = {};
        for (const [path, message] of Object.entries(problem.fields)) {
          const field = SERVER_FIELD_MAP[path] ?? (path.startsWith('points') ? 'points' : undefined);
          if (field && !fields[field]) fields[field] = message;
        }
        this.serverErrors.set(fields);
        this.rejected.set(JSON.stringify(this.model()));
        this.error.set(problem.message);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }
}
