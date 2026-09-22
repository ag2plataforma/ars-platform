import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslocoLoader } from '@jsverse/transloco';

/**
 * Carga los JSON de traducción (`public/i18n/<lang>.json`, servidos tal
 * cual por Angular como asset estático -- ver `angular.json`, el glob
 * `public/**` ya se usa para `public/brand/`) vía `HttpClient`. Único
 * loader necesario acá: no hay ningún backend de traducciones de UI --
 * eso sería un dominio totalmente distinto de `STextContent`/
 * `STranslator` (`I18nModule` de `reference-data-service`), que es
 * traducción de CONTENIDO de negocio (ej. la descripción de un producto
 * en varios idiomas), no de los textos fijos de la interfaz (ver
 * docs/02-roadmap.md para la distinción completa).
 */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Record<string, unknown>>(`/i18n/${lang}.json`);
  }
}
