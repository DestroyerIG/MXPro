import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding: parâmetros, query params e `data` da rota chegam direto nos
    // input() do componente da página, sem precisar injetar ActivatedRoute.
    provideRouter(routes, withComponentInputBinding()),
    // provideAppInitializer: roda antes da primeira tela. Aqui só "acorda" o ThemeService para
    // aplicar o tema salvo já na abertura, sem esperar alguma tela injetá-lo.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
  ],
};
