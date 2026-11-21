import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField as SignalFormField, form, required, submit } from '@angular/forms/signals';
import { type EventCategoryDto, type EventDto, HEAT_STATUS_LABELS, type HeatDto, type HeatStatus } from '@mxpro/shared';
import { toApiProblem } from '../../../../core/http/api-problem';
import { formatEventDay, formatEventTime, isoToZonedInput, zonedInputToIso } from '../../../../shared/format/date-time';
import { Button } from '../../../../shared/ui/button/button';
import { Control, FormField } from '../../../../shared/ui/form-field/form-field';
import { type StatusTone, StatusBadge } from '../../../../shared/ui/status-badge/status-badge';
import { Table } from '../../../../shared/ui/table/table';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { EventsApi, eventCategoriesUrl, heatsUrl } from '../events-api';

interface HeatFormModel {
  name: string;
  /** Dia do evento "AAAA-MM-DD". */
  day: string;
  /** "HH:mm" no fuso do evento; '' = horário a definir. */
  time: string;
}

const HEAT_TONE: Record<HeatStatus, StatusTone> = { SCHEDULED: 'idle', IN_PROGRESS: 'ok', FINISHED: 'info', CANCELED: 'danger' };

/** Dias do evento, de início a fim ("2027-04-17", "2027-04-18"). */
function eventDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Programação do evento (aba "Baterias"): cada bateria tem nome, horário (no fuso do evento) e uma
 * ou mais categorias largando juntas. Só baterias programadas são editadas; iniciar e encerrar
 * vêm com a cronometragem.
 */
@Component({
  selector: 'app-event-heats',
  imports: [SignalFormField, FormField, Control, Button, StatusBadge, Table],
  templateUrl: './event-heats.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventHeats {
  private readonly api = inject(EventsApi);
  private readonly toasts = inject(ToastService);

  readonly event = input.required<EventDto>();
  readonly editable = input(false);
  readonly changed = output<void>();

  protected readonly heats = httpResource<{ heats: HeatDto[] }>(() => heatsUrl(this.event().id));
  protected readonly categories = httpResource<{ categories: EventCategoryDto[] }>(() => eventCategoriesUrl(this.event().id));

  protected readonly days = computed(() => {
    const e = this.event();
    return eventDays(e.startDate, e.endDate).map((day) => ({
      day,
      label: formatEventDay(`${day}T12:00:00Z`, 'UTC'),
    }));
  });
  private readonly multiDay = computed(() => this.days().length > 1);

  protected readonly rows = computed(() => {
    const tz = this.event().timeZone;
    return (this.heats.value()?.heats ?? []).map((h) => ({
      ...h,
      when: h.scheduledAt
        ? `${this.multiDay() ? `${formatEventDay(h.scheduledAt, tz)} ` : ''}${formatEventTime(h.scheduledAt, tz)}`
        : 'A definir',
      categoryNames: h.categories.map((c) => c.name).join(' + '),
      statusLabel: HEAT_STATUS_LABELS[h.status],
      statusTone: HEAT_TONE[h.status],
      editableRow: h.status === 'SCHEDULED',
    }));
  });

  protected readonly editingId = signal<string | null>(null);

  /** linkedSignal: começa no primeiro dia do evento (o input só existe depois de criado o componente). */
  protected readonly model = linkedSignal<HeatFormModel>(() => ({ name: '', day: this.event().startDate, time: '' }));
  protected readonly heatForm = form(this.model, (p) => {
    required(p.name, { message: 'Informe o nome da bateria (ex.: Bateria 1).' });
  });
  /** Categorias marcadas (caixas de seleção). Fora do Signal Form por ser um conjunto de ids. */
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly categoriesError = signal<string | null>(null);

  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected nameError(): string | null {
    const state = this.heatForm.name();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected toggle(eventCategoryId: string, checked: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (checked) next.add(eventCategoryId);
      else next.delete(eventCategoryId);
      return next;
    });
    if (checked) this.categoriesError.set(null);
  }

  protected edit(heat: HeatDto): void {
    this.error.set(null);
    this.categoriesError.set(null);
    this.editingId.set(heat.id);
    const local = heat.scheduledAt ? isoToZonedInput(heat.scheduledAt, this.event().timeZone) : '';
    this.model.set({
      name: heat.name,
      day: local ? local.slice(0, 10) : this.event().startDate,
      time: local ? local.slice(11, 16) : '',
    });
    this.selected.set(new Set(heat.categories.map((c) => c.eventCategoryId)));
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.resetForm();
  }

  protected onSubmit(e: Event): void {
    e.preventDefault();
    this.error.set(null);
    const ids = [...this.selected()];
    if (!ids.length) this.categoriesError.set('Marque ao menos uma categoria.');
    void submit(this.heatForm, async () => {
      if (!ids.length) return undefined;
      const m = this.model();
      const body = {
        name: m.name,
        scheduledAt: m.time ? zonedInputToIso(`${m.day}T${m.time}`, this.event().timeZone) : null,
        eventCategoryIds: ids,
      };
      const editing = this.editingId();
      await this.run(async () => {
        if (editing) {
          await this.api.updateHeat(this.event().id, editing, body);
          this.toasts.show(`${body.name}: alterações salvas.`, { tone: 'ok' });
          this.editingId.set(null);
        } else {
          await this.api.createHeat(this.event().id, body);
          this.toasts.show(`${body.name} adicionada à programação.`, { tone: 'ok' });
        }
        this.resetForm();
      });
      return undefined;
    });
  }

  protected remove(heat: HeatDto): Promise<void> {
    return this.run(async () => {
      await this.api.deleteHeat(this.event().id, heat.id);
      if (this.editingId() === heat.id) this.cancelEdit();
      this.toasts.show(`${heat.name} removida da programação.`, { tone: 'ok' });
    });
  }

  private resetForm(): void {
    this.model.set({ name: '', day: this.event().startDate, time: '' });
    this.selected.set(new Set());
    this.categoriesError.set(null);
    this.heatForm().reset();
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await work();
      this.heats.reload();
      this.categories.reload(); // contagem de baterias por categoria
      this.changed.emit();
    } catch (err) {
      const problem = toApiProblem(err);
      this.error.set(problem.fields['scheduledAt'] ?? problem.fields['eventCategoryIds'] ?? problem.message);
    } finally {
      this.busy.set(false);
    }
  }
}
