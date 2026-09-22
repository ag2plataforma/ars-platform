import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideTransloco } from '@jsverse/transloco';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { TranslocoHttpLoader } from './core/i18n/transloco-http-loader';
import { environment } from '../environments/environment';

/**
 * Color de marca (logo real del usuario, ver `public/brand/logo.png` y
 * `docs/02-roadmap.md`) muestreado del PNG que compartió: violeta
 * ~#6D4AEF. Aura viene con "emerald" (verde) como `primary` por defecto
 * -- `definePreset` sobreescribe la escala completa 50-950 (mismo shape
 * que `@primeuix/themes/aura/base`, confirmado leyendo su fuente) para
 * que TODOS los componentes PrimeNG (botones, tabs activos, focus rings,
 * etc.) usen este violeta en vez del verde de fábrica, sin tocar cada
 * componente uno por uno. Mismo hex expuesto a Tailwind como `--color-brand`
 * en `styles.css`, para que el sidebar (clases Tailwind, no PrimeNG) use
 * exactamente el mismo tono.
 */
const ArsPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#F4F1FE',
      100: '#E5DEFC',
      200: '#C6B9F9',
      300: '#A18AF5',
      400: '#8669F2',
      500: '#6D4AEF',
      600: '#4D23EC',
      700: '#3B13D3',
      800: '#310FAD',
      900: '#280C8D',
      950: '#1A085E',
    },
  },
});

/**
 * Base del bootstrap standalone (Angular 22, sin NgModules). PrimeNG usa el
 * tema nuevo basado en tokens ("Aura", ver docs/02-roadmap.md -- reemplaza
 * al tema CSS estático "lara-light-purple" que usaba la v1 del backoffice),
 * con `ArsPreset` encima para el color de marca real. Tailwind se aplica
 * vía clases de utilidad directo en los templates, sin módulo propio --
 * solo necesita el PostCSS plugin (ver .postcssrc.json).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    /**
     * i18n del frontend (pedido explícito del usuario, ver
     * docs/02-roadmap.md): Transloco elegido sobre ngx-translate (más
     * activo/mantenido, API basada en señales, igual que el resto de
     * este proyecto) y sobre el i18n nativo de Angular (`@angular/localize`
     * exige un build separado por idioma; acá se quería un solo build
     * con archivos JSON, ver `TranslocoHttpLoader`). Alcance decidido con
     * el usuario: por ahora un solo idioma (`es`) -- el mecanismo queda
     * listo para agregar otro con solo sumar su JSON en `public/i18n/`,
     * sin tocar código ni plantillas.
     */
    provideTransloco({
      config: {
        availableLangs: ['es'],
        defaultLang: 'es',
        reRenderOnLangChange: false,
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader,
    }),
    providePrimeNG({
      theme: {
        preset: ArsPreset,
        options: {
          darkModeSelector: false,
        },
      },
    }),
  ],
};
