import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { BrandingService } from './core/branding/branding.service';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding: parâmetros, query params e `data` da rota chegam direto nos
    // input() do componente da página, sem precisar injetar ActivatedRoute.
    provideRouter(routes, withComponentInputBinding()),
    // provideAppInitializer: roda antes da primeira tela. Aqui só "acorda" o ThemeService para
    // aplicar o tema salvo já na abertura, sem esperar alguma tela injetá-lo.
    // HttpClient: chamadas à API. withFetch usa a API fetch do navegador (padrão moderno).
    provideHttpClient(withFetch()),
    // provideAppInitializer: roda antes da primeira tela. Liga o tema salvo e aplica a marca em cache;
    // a busca da marca atual na API NÃO é aguardada (`void`): a tela abre mesmo sem internet.
    provideAppInitializer(() => {
      inject(ThemeService);
      void inject(BrandingService).refresh();
    }),
  ],
};
