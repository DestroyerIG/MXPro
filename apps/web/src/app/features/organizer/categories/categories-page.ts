import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField as SignalFormField, form, maxLength, required, submit } from '@angular/forms/signals';
import type { CategoryDto } from '@mxpro/shared';
import { SessionService } from '../../../core/auth/session.service';
import { toApiProblem } from '../../../core/http/api-problem';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Control, FormField } from '../../../shared/ui/form-field/form-field';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { Table } from '../../../shared/ui/table/table';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { CATEGORIES_URL, EventsApi } from '../events/events-api';

/**
 * Catálogo de categorias (/painel/categorias): MX1, MX2, Feminino… É o mesmo em todos os eventos,
 * o que permite somar pontos de uma categoria etapa a etapa no campeonato. Valor e vagas são
 * definidos em cada evento. Categoria já usada não é excluída: é desativada.
 */
@Component({
  selector: 'app-categories-page',
  imports: [SignalFormField, FormField, Control, Button, ConfirmDialog, StatusBadge, Table],
  templateUrl: './categories-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesPage {
  private readonly api = inject(EventsApi);
  private readonly toasts = inject(ToastService);
  private readonly session = inject(SessionService);

  protected readonly canEdit = computed(() => this.session.user()?.role === 'ORGANIZER');
  protected readonly list = httpResource<{ categories: CategoryDto[] }>(() => CATEGORIES_URL);

  protected readonly rows = computed(() =>
    (this.list.value()?.categories ?? []).map((c) => ({
      ...c,
      usage: c.eventCount === 0 ? 'Nenhum' : c.eventCount === 1 ? '1 evento' : `${c.eventCount} eventos`,
    })),
  );
  protected readonly summary = computed(() => {
    const all = this.list.value()?.categories ?? [];
    const active = all.filter((c) => c.active).length;
    return `${all.length} ${all.length === 1 ? 'categoria' : 'categorias'} • ${active} ${active === 1 ? 'ativa' : 'ativas'}`;
  });

  protected readonly editingId = signal<string | null>(null);
  protected readonly model = signal({ name: '', description: '' });
  protected readonly categoryForm = form(this.model, (p) => {
    required(p.name, { message: 'Informe o nome da categoria.' });
    maxLength(p.name, 40, { message: 'Use no máximo 40 caracteres.' });
    maxLength(p.description, 200, { message: 'Use no máximo 200 caracteres.' });
  });
  /** Erro da API que aponta o nome (ex.: categoria repetida). */
  /** Erro da API sobre o nome, junto com o nome recusado: some assim que a pessoa muda o nome. */
  private readonly nameServerError = signal<{ name: string; message: string } | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** Categoria aguardando confirmação de exclusão. */
  protected readonly toDelete = signal<CategoryDto | null>(null);

  protected fieldError(name: 'name' | 'description'): string | null {
    const server = this.nameServerError();
    if (name === 'name' && server && server.name === this.model().name) return server.message;
    const state = this.categoryForm[name]();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected edit(c: CategoryDto): void {
    this.error.set(null);
    this.nameServerError.set(null);
    this.editingId.set(c.id);
    this.model.set({ name: c.name, description: c.description ?? '' });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.resetForm();
  }

  protected onSubmit(e: Event): void {
    e.preventDefault();
    this.error.set(null);
    this.nameServerError.set(null);
    void submit(this.categoryForm, async () => {
      const body = { name: this.model().name, description: this.model().description || null };
      const editing = this.editingId();
      await this.run(async () => {
        if (editing) {
          const saved = await this.api.updateCategory(editing, body);
          this.toasts.show(`${saved.name}: alterações salvas.`, { tone: 'ok' });
          this.editingId.set(null);
        } else {
          const created = await this.api.createCategory(body);
          this.toasts.show(`Categoria ${created.name} criada.`, { tone: 'ok' });
        }
        this.resetForm();
      });
      return undefined;
    });
  }

  protected setActive(c: CategoryDto, active: boolean): Promise<void> {
    return this.run(async () => {
      await this.api.updateCategory(c.id, { active });
      this.toasts.show(active ? `${c.name} reativada.` : `${c.name} desativada: não aparece mais para novos eventos.`, {
        tone: 'ok',
      });
    });
  }

  protected confirmDelete(): Promise<void> {
    const c = this.toDelete();
    if (!c) return Promise.resolve();
    return this.run(async () => {
      await this.api.deleteCategory(c.id);
      if (this.editingId() === c.id) this.cancelEdit();
      this.toasts.show(`Categoria ${c.name} excluída.`, { tone: 'ok' });
    });
  }

  private resetForm(): void {
    this.model.set({ name: '', description: '' });
    this.categoryForm().reset();
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await work();
      this.list.reload();
    } catch (err) {
      const problem = toApiProblem(err);
      const nameError = problem.fields['name'];
      if (nameError) this.nameServerError.set({ name: this.model().name, message: nameError });
      else this.error.set(problem.message);
    } finally {
      this.busy.set(false);
    }
  }
}
