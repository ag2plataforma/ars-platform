import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';

/**
 * Base del bootstrap standalone (Angular 22, sin NgModules). PrimeNG usa el
 * tema nuevo basado en tokens ("Aura", ver docs/02-roadmap.md -- reemplaza
 * al tema CSS estático "lara-light-purple" que usaba la v1 del backoffice).
 * Tailwind se aplica vía clases de utilidad directo en los templates, sin
 * módulo propio -- solo necesita el PostCSS plugin (ver .postcssrc.json).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: false,
        },
      },
    }),
  ],
};
