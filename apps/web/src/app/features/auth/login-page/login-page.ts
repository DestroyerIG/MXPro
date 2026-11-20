import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormField as SignalFormField, email, form, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type { ApiErrorBody, LoginRequest } from '@mxpro/shared';
import { HOME_BY_ROLE, SessionService, isSafeReturnUrl } from '../../../core/auth/session.service';
import { BrandLogo } from '../../../shared/brand-logo/brand-logo';
import { Button } from '../../../shared/ui/button/button';
import { Control, FormField } from '../../../shared/ui/form-field/form-field';

const OFFLINE_MESSAGE = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
const GENERIC_MESSAGE = 'Não foi possível entrar agora. Tente de novo em instantes.';

/**
 * Tela de login (/entrar).
 *
 * Formulário com **Signal Forms**: o modelo é um signal comum e `form()` cria, a partir dele, uma
 * árvore de campos com estado próprio (valor, erros, tocado…), também em signals. A alternativa
 * clássica é Reactive Forms (FormGroup/FormControl); no Angular 22 os Signal Forms são o caminho
 * recomendado para formulários novos e conversam direto com o resto do app, que já usa signals.
 *
 * A validação aqui é só para ajudar quem digita. A API valida de novo com o schema Zod do
 * `@mxpro/shared` (o front não importa o Zod para não aumentar o bundle).
 */
@Component({
  selector: 'app-login-page',
  imports: [SignalFormField, FormField, Control, Button, BrandLogo],
  templateUrl: './login-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  /** `?voltar=/painel/inscricoes`: página que a pessoa tentou abrir antes do login (via withComponentInputBinding). */
  readonly voltar = input<string>();

  protected readonly model = signal<LoginRequest>({ email: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.email, { message: 'Informe o e-mail.' });
    email(path.email, { message: 'Informe um e-mail válido.' });
    required(path.password, { message: 'Informe a senha.' });
  });

  /** Erro devolvido pela API (senha errada, usuário desativado, muitas tentativas, sem conexão). */
  protected readonly serverError = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  /** Mensagem de um campo, mostrada só depois que a pessoa passou por ele (ou tentou enviar). */
  protected fieldError(field: 'email' | 'password'): string | null {
    const state = this.loginForm[field]();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected onSubmit(event: Event): void {
    event.preventDefault(); // o navegador não recarrega a página; quem envia é o Angular
    this.serverError.set(null);
    // submit(): marca todos os campos como tocados (mostra os erros) e só chama a ação se estiver válido.
    void submit(this.loginForm, async () => {
      try {
        const user = await this.session.login(this.model());
        const back = this.voltar();
        await this.router.navigateByUrl(isSafeReturnUrl(back) ? back : HOME_BY_ROLE[user.role]);
      } catch (err) {
        this.serverError.set(messageFor(err));
        // Limpa só a senha e devolve o campo a "não tocado" (sem um segundo erro "Informe a senha.").
        this.loginForm.password().reset('');
        this.loginForm.password().focusBoundControl();
      }
      return undefined;
    });
  }
}

function messageFor(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) return GENERIC_MESSAGE;
  if (err.status === 0) return OFFLINE_MESSAGE;
  const body = err.error as Partial<ApiErrorBody> | null;
  // A API já responde em português (formato único { code, message }); 5xx não traz detalhe útil.
  return err.status < 500 && typeof body?.message === 'string' ? body.message : GENERIC_MESSAGE;
}
