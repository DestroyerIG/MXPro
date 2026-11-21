import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormField as SignalFormField, form, pattern, required, submit, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { type CategoryDto, type EventCategoryDto, MODALITIES, MODALITY_LABELS, type Modality } from '@mxpro/shared';
import { toApiProblem } from '../../../../core/http/api-problem';
import { centsToInput, formatBrl, parseBrl } from '../../../../shared/format/money';
import { Button } from '../../../../shared/ui/button/button';
import { Control, FormField } from '../../../../shared/ui/form-field/form-field';
import { Table } from '../../../../shared/ui/table/table';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { CATEGORIES_URL, EventsApi, eventCategoriesUrl } from '../events-api';

interface CategoryFormModel {
  categoryId: string;
  modality: Modality;
  /** Valor em reais, como digitado ("150,00"). Convertido para centavos só no envio. */
  fee: string;
  /** '' = sem limite. */
  maxEntries: string;
}

const EMPTY: CategoryFormModel = { categoryId: '', modality: 'MOTOCROSS', fee: '', maxEntries: '' };

/**
 * Categorias disputadas no evento (aba "Categorias" da página do evento): quais categorias do
 * catálogo, com modalidade, valor da inscrição e vagas. Componente filho da página do evento:
 * recebe o id por `input()` e avisa a página por `output()` quando algo muda (para ela atualizar
 * as contagens do cabeçalho).
 */
@Component({
  selector: 'app-event-categories',
  imports: [RouterLink, SignalFormField, FormField, Control, Button, Table],
  templateUrl: './event-categories.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCategories {
  private readonly api = inject(EventsApi);
  private readonly toasts = inject(ToastService);

  readonly eventId = input.required<string>();
  /** Falso para secretaria ou evento encerrado/cancelado: só consulta. */
  readonly editable = input(false);
  /** Avisa a página que a lista mudou. */
  readonly changed = output<void>();

  protected readonly list = httpResource<{ categories: EventCategoryDto[] }>(() => eventCategoriesUrl(this.eventId()));
  /** Catálogo (só categorias ativas). Sem permissão de editar, nem busca. */
  protected readonly catalog = httpResource<{ categories: CategoryDto[] }>(() =>
    this.editable() ? `${CATEGORIES_URL}?active=true` : undefined,
  );

  protected readonly rows = computed(() =>
    (this.list.value()?.categories ?? []).map((c) => ({
      ...c,
      modalityLabel: MODALITY_LABELS[c.modality],
      fee: formatBrl(c.entryFeeCents),
      slots: c.maxEntries === null ? 'Sem limite' : String(c.maxEntries),
    })),
  );

  /** Categoria em edição (null = formulário de inclusão). */
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingName = computed(
    () => this.list.value()?.categories.find((c) => c.id === this.editingId())?.category.name ?? '',
  );

  /** Só oferece as categorias do catálogo que ainda não estão no evento. */
  protected readonly available = computed(() => {
    const inEvent = new Set((this.list.value()?.categories ?? []).map((c) => c.category.id));
    return (this.catalog.value()?.categories ?? []).filter((c) => !inEvent.has(c.id));
  });

  protected readonly modalities = MODALITIES.map((id) => ({ id, label: MODALITY_LABELS[id] }));

  protected readonly model = signal<CategoryFormModel>({ ...EMPTY });
  protected readonly categoryForm = form(this.model, (p) => {
    required(p.categoryId, { message: 'Escolha a categoria.', when: () => this.editingId() === null });
    required(p.fee, { message: 'Informe o valor da inscrição (0 se for gratuita).' });
    validate(p.fee, ({ value }) =>
      value() && parseBrl(value()) === null ? { kind: 'money', message: 'Use um valor em reais, ex.: 150,00.' } : undefined,
    );
    pattern(p.maxEntries, /^([1-9]\d{0,3})?$/, { message: 'Use um número de 1 a 9999, ou deixe em branco.' });
  });

  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected fieldError(name: keyof CategoryFormModel): string | null {
    const state = this.categoryForm[name]();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected edit(row: EventCategoryDto): void {
    this.error.set(null);
    this.editingId.set(row.id);
    this.model.set({
      categoryId: row.category.id,
      modality: row.modality,
      fee: centsToInput(row.entryFeeCents),
      maxEntries: row.maxEntries?.toString() ?? '',
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.resetForm();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.error.set(null);
    void submit(this.categoryForm, async () => {
      const m = this.model();
      const data = {
        modality: m.modality,
        entryFeeCents: parseBrl(m.fee) ?? 0,
        maxEntries: m.maxEntries ? Number(m.maxEntries) : null,
      };
      const editing = this.editingId();
      await this.run(async () => {
        if (editing) {
          const saved = await this.api.updateEventCategory(this.eventId(), editing, data);
          this.toasts.show(`${saved.category.name}: alterações salvas.`, { tone: 'ok' });
          this.editingId.set(null);
        } else {
          const added = await this.api.addEventCategory(this.eventId(), { categoryId: m.categoryId, ...data });
          this.toasts.show(`${added.category.name} adicionada ao evento.`, { tone: 'ok' });
        }
        this.resetForm();
      });
      return undefined;
    });
  }

  protected remove(row: EventCategoryDto): Promise<void> {
    return this.run(async () => {
      await this.api.removeEventCategory(this.eventId(), row.id);
      if (this.editingId() === row.id) this.cancelEdit();
      this.toasts.show(`${row.category.name} removida do evento.`, { tone: 'ok' });
    });
  }

  private resetForm(): void {
    this.model.set({ ...EMPTY });
    this.categoryForm().reset();
  }

  /** Chama a API, recarrega a lista e avisa a página; erros (ex.: "está em baterias") viram mensagem. */
  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await work();
      this.list.reload();
      this.changed.emit();
    } catch (err) {
      this.error.set(toApiProblem(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
