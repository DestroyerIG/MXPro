import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REGISTRATION_STATUS_LABELS, type RegistrationDto } from '@mxpro/shared';
import { formatCalendarDate } from '../../../shared/format/date-time';
import { formatBrl } from '../../../shared/format/money';
import { StatusBadge, type StatusTone } from '../../../shared/ui/status-badge/status-badge';
import { PilotFrame } from '../pilot-frame/pilot-frame';
import { MY_REGISTRATIONS_URL } from '../registration-api';

const TONES: Record<RegistrationDto['status'], StatusTone> = {
  PENDING_PAYMENT: 'warn',
  CONFIRMED: 'ok',
  EXPIRED: 'idle',
  CANCELED: 'danger',
};

/** Minhas inscrições (/minhas-inscricoes): página inicial do piloto até a área completa (fase 7). */
@Component({
  selector: 'app-my-registrations',
  imports: [RouterLink, PilotFrame, StatusBadge],
  template: `
    <app-pilot-frame heading="Minhas inscrições">
      @if (list.hasValue()) {
        @if (rows().length) {
          <ul class="grid gap-3">
            @for (r of rows(); track r.id) {
              <li>
                <a [routerLink]="['/minhas-inscricoes', r.id]" class="block rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
                  <span class="flex items-start justify-between gap-3">
                    <span class="min-w-0">
                      <span class="block font-bold">{{ r.event.name }}</span>
                      <span class="block text-sm text-ink-2">{{ r.date }} • {{ r.category.name }} • nº {{ r.raceNumber }}</span>
                    </span>
                    <ui-status-badge [tone]="r.tone">{{ r.label }}</ui-status-badge>
                  </span>
                  @if (r.status === 'PENDING_PAYMENT') {
                    <span class="mt-2 block text-sm font-bold text-brand-text">Pagar {{ r.fee }} com Pix</span>
                  }
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-ink-2">
            Você ainda não tem inscrições. Use o link do evento divulgado pela organização para se inscrever.
          </p>
        }
      } @else if (list.error()) {
        <div role="alert" class="rounded-lg border-2 border-danger bg-surface p-4">
          <p class="font-bold">Não foi possível carregar suas inscrições.</p>
          <button type="button" class="mt-2 font-bold text-brand-text underline" (click)="list.reload()">Tentar de novo</button>
        </div>
      } @else {
        <div aria-busy="true" class="h-40 animate-pulse rounded-lg bg-line"><span class="sr-only">Carregando…</span></div>
      }
    </app-pilot-frame>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyRegistrations {
  protected readonly list = httpResource<{ registrations: RegistrationDto[] }>(() => MY_REGISTRATIONS_URL);
  protected readonly rows = computed(() =>
    (this.list.hasValue() ? this.list.value().registrations : []).map((r) => {
      const paidNoSlot = r.status === 'EXPIRED' && r.paymentReceived;
      return {
        ...r,
        date: formatCalendarDate(r.event.startDate),
        fee: formatBrl(r.entryFeeCents),
        label: paidNoSlot ? 'Pago, vaga em análise' : REGISTRATION_STATUS_LABELS[r.status],
        tone: paidNoSlot ? ('warn' as const) : TONES[r.status],
      };
    }),
  );
}
