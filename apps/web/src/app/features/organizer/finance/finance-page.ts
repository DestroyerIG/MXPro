import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MP_CONNECT_RESULTS, type MercadoPagoConnectResult, type MercadoPagoConnectionDto } from '@mxpro/shared';
import { SessionService } from '../../../core/auth/session.service';
import { toApiProblem } from '../../../core/http/api-problem';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { EXTERNAL_NAVIGATION, MERCADO_PAGO_URL, PaymentsApi } from './payments-api';

/** Mensagem para cada resultado do retorno do Mercado Pago (?mercadopago=…). */
const RESULT_MESSAGES: Record<MercadoPagoConnectResult, { tone: 'ok' | 'warn' | 'danger'; text: string }> = {
  conectado: { tone: 'ok', text: 'Conta do Mercado Pago conectada. Os Pix das inscrições vão cair nela.' },
  negado: { tone: 'warn', text: 'A conexão foi cancelada no Mercado Pago. Nada foi alterado.' },
  expirado: { tone: 'warn', text: 'O pedido de conexão venceu ou já foi usado. Clique em "Conectar Mercado Pago" de novo.' },
  sessao: { tone: 'warn', text: 'Sua sessão terminou durante a conexão. Entre de novo como organizador e clique em "Conectar Mercado Pago".' },
  falha: { tone: 'danger', text: 'O Mercado Pago não confirmou a conexão. Tente de novo em instantes.' },
  'nao-configurado': { tone: 'danger', text: 'A integração com o Mercado Pago ainda não foi configurada no servidor.' },
};

const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/**
 * Financeiro (/painel/financeiro). Por enquanto: a conta do Mercado Pago que recebe os Pix das
 * inscrições, conectada por OAuth (ADR 0005). Conciliação, estornos e baixas manuais vêm depois.
 */
@Component({
  selector: 'app-finance-page',
  imports: [Button, Card, ConfirmDialog, StatusBadge],
  templateUrl: './finance-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancePage {
  private readonly api = inject(PaymentsApi);
  private readonly toasts = inject(ToastService);
  private readonly navigate = inject(EXTERNAL_NAVIGATION);
  private readonly session = inject(SessionService);

  /** Resultado do retorno do OAuth, vindo da URL (?mercadopago=conectado). */
  readonly mercadopago = input<string>();

  protected readonly isOrganizer = computed(() => this.session.user()?.role === 'ORGANIZER');
  /** Só o organizador vê a conta (a API recusa os demais); para os outros, nem busca. */
  protected readonly connection = httpResource<MercadoPagoConnectionDto>(() => (this.isOrganizer() ? MERCADO_PAGO_URL : undefined));

  protected readonly result = computed(() => {
    const value = this.mercadopago();
    return (MP_CONNECT_RESULTS as readonly string[]).includes(value ?? '') ? RESULT_MESSAGES[value as MercadoPagoConnectResult] : null;
  });

  protected readonly account = computed(() => {
    const a = this.connection.value()?.account;
    return a && {
      ...a,
      connectedAt: DATE.format(new Date(a.connectedAt)),
      expiresAt: DATE.format(new Date(a.expiresAt)),
    };
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Pede a URL de autorização à API e leva o organizador ao Mercado Pago. */
  protected async connect(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { authorizationUrl } = await this.api.startMercadoPagoConnection();
      this.navigate(authorizationUrl);
    } catch (err) {
      this.error.set(toApiProblem(err).message);
      this.busy.set(false);
    }
  }

  protected async disconnect(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.disconnectMercadoPago();
      this.connection.reload();
      this.toasts.show('Conta do Mercado Pago desconectada.', { tone: 'ok' });
    } catch (err) {
      this.error.set(toApiProblem(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
