import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REGISTRATION_STATUS_LABELS, type RegistrationDto } from '@mxpro/shared';
import { toApiProblem } from '../../../core/http/api-problem';
import { formatEventTime } from '../../../shared/format/date-time';
import { formatBrl } from '../../../shared/format/money';
import { formatCountdown } from '../../../shared/format/race-time';
import { Button } from '../../../shared/ui/button/button';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { PilotFrame } from '../pilot-frame/pilot-frame';
import { PixQr } from '../pix-qr/pix-qr';
import { RegistrationsApi, registrationUrl } from '../registration-api';

/** De quanto em quanto tempo a tela pergunta se o Pix foi pago (a API consulta o Mercado Pago). */
export const PAYMENT_POLL_MS = 5_000;

/**
 * Pagamento e situação da inscrição (/minhas-inscricoes/:id), PDF página 5:
 * QR Code + "Copiar código Pix" + "Aguardando pagamento…" que vira "Inscrição confirmada!" sozinho.
 *
 * Enquanto aguarda, a tela pergunta à API a cada 5 s (e a API consulta o Mercado Pago no máximo a
 * cada 10 s). Assim a confirmação aparece mesmo que o aviso do Mercado Pago (webhook) não chegue.
 */
@Component({
  selector: 'app-payment-page',
  imports: [RouterLink, Button, PilotFrame, PixQr],
  templateUrl: './payment-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentPage {
  private readonly api = inject(RegistrationsApi);
  private readonly toasts = inject(ToastService);

  /** :id da rota. */
  readonly id = input.required<string>();

  protected readonly registration = httpResource<RegistrationDto>(() => registrationUrl(this.id()));
  /**
   * Valor atual ou undefined. Com o recurso em erro, `value()` LANÇA exceção (o Angular força tratar
   * o erro); por isso perguntamos `hasValue()` antes.
   */
  private readonly current = computed(() => (this.registration.hasValue() ? this.registration.value() : undefined));
  /** Relógio da tela (contagem regressiva do Pix). */
  protected readonly now = signal(Date.now());

  protected readonly view = computed(() => {
    const r = this.current();
    if (!r) return null;
    const paidNoSlot = r.status === 'EXPIRED' && r.paymentReceived;
    return {
      ...r,
      paidNoSlot,
      statusLabel: paidNoSlot ? 'Pagamento recebido, vaga em análise' : REGISTRATION_STATUS_LABELS[r.status],
      fee: formatBrl(r.entryFeeCents),
      pixUntil: r.pix ? formatEventTime(r.pix.expiresAt, r.event.timeZone) : null,
    };
  });

  /** "27:12" até o Pix vencer (some quando vence; a próxima consulta traz a situação nova). */
  protected readonly remaining = computed(() => {
    const pix = this.current()?.pix;
    if (!pix) return null;
    const ms = new Date(pix.expiresAt).getTime() - this.now();
    return ms > 0 ? formatCountdown(ms) : null;
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);

  constructor() {
    let ticks = 0;
    const timer = setInterval(() => {
      this.now.set(Date.now());
      ticks += 1;
      const waiting = this.current()?.status === 'PENDING_PAYMENT';
      if (waiting && ticks % (PAYMENT_POLL_MS / 1000) === 0 && !this.registration.isLoading()) this.registration.reload();
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Copia o "copia e cola". Sem permissão de área de transferência, o código fica visível para copiar à mão. */
  protected async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      this.toasts.show('Código Pix copiado. Cole no app do seu banco.', { tone: 'ok' });
    } catch {
      this.error.set('Não deu para copiar automaticamente. Selecione o código abaixo e copie.');
    }
  }

  /** Gera o Pix de novo (vencido, ou não gerado por falha do Mercado Pago). */
  protected async renew(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { registration, pixError } = await this.api.renewPix(this.id());
      this.registration.set(registration);
      this.error.set(pixError);
      this.copied.set(false);
    } catch (err) {
      const problem = toApiProblem(err);
      this.error.set(problem.fields['raceNumber'] ?? problem.message);
      this.registration.reload();
    } finally {
      this.busy.set(false);
    }
  }
}
