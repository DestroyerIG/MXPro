import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { BrandingService } from './core/branding/branding.service';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding: parâmetros, query params e `data` da rota chegam direto nos
    // input() do componente da página, sem precisar injetar ActivatedRoute.
    provideRouter(routes, withComponentInputBinding()),
    // HttpClient: chamadas à API. withFetch usa a API fetch do navegador (padrão moderno).
    // withInterceptors: funções que toda requisição atravessa (aqui: sessão expirada → tela de login).
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // provideAppInitializer: roda antes da primeira tela. Liga o tema salvo e aplica a marca em cache;
    // a busca da marca atual na API NÃO é aguardada (`void`): a tela abre mesmo sem internet.
    provideAppInitializer(() => {
      inject(ThemeService);
      void inject(BrandingService).refresh();
    }),
  ],
};
