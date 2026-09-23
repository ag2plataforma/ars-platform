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
 * Color de marca -- reemplazado el 23/09/2026 a pedido explícito del
 * usuario (antes ~#6D4AEF/#3B13D3 muestreado del logo real). Nuevo
 * ancla: `#6963B3` (lavanda apagado), que pasa a ser el escalón 500 --
 * mismo criterio que el original (el hex pedido = 500, resto de la
 * escala 50-950 regenerada en HSL manteniendo el mismo matiz/saturación
 * constantes y la misma progresión relativa de luminosidad por escalón
 * que ya tenía la escala anterior, solo desplazada al nuevo tono).
 * Aura viene con "emerald" (verde) como `primary` por defecto --
 * `definePreset` sobreescribe la escala completa 50-950 (mismo shape
 * que `@primeuix/themes/aura/base`, confirmado leyendo su fuente) para
 * que TODOS los componentes PrimeNG (botones, tabs activos, focus rings,
 * enlaces, texto de encabezado de tablas, etc.) usen este tono en vez
 * del verde de fábrica, sin tocar cada componente uno por uno. Misma
 * escala expuesta a Tailwind como `--color-brand-*` en `styles.css`,
 * para que el sidebar (clases Tailwind, no PrimeNG) use exactamente el
 * mismo tono.
 */
const ArsPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#DFDDEF',
      100: '#D1CFE8',
      200: '#B7B4DB',
      300: '#9692CA',
      400: '#7F7ABE',
      500: '#6963B3',
      600: '#534D9E',
      700: '#454083',
      800: '#363267',
      900: '#2A274F',
      950: '#18162D',
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
    /**
     * Traducción de los textos internos de PrimeNG (no pasan por
     * Transloco -- son cadenas fijas del propio componente: menú de
     * filtro por columna, calendario, etc., ver
     * `primeng/config`::`translation` por defecto). Pedido explícito
     * del usuario (23/09/2026): el formulario de filtro de las tablas
     * salía en inglés ("Contains"/"Clear"/"Apply"...). Se traduce el
     * objeto completo (mismas claves que el default en inglés, ver
     * `primeng-config.mjs`), no solo las visibles hoy en el menú de
     * filtro, para que quede listo también para calendario/upload/etc.
     * si se usan más adelante.
     */
    providePrimeNG({
      theme: {
        preset: ArsPreset,
        options: {
          darkModeSelector: false,
        },
      },
      translation: {
        startsWith: 'Comienza con',
        contains: 'Contiene',
        notContains: 'No contiene',
        endsWith: 'Termina con',
        equals: 'Igual a',
        notEquals: 'Distinto de',
        noFilter: 'Sin filtro',
        lt: 'Menor que',
        lte: 'Menor o igual que',
        gt: 'Mayor que',
        gte: 'Mayor o igual que',
        is: 'Es',
        isNot: 'No es',
        before: 'Antes de',
        after: 'Después de',
        dateIs: 'La fecha es',
        dateIsNot: 'La fecha no es',
        dateBefore: 'La fecha es anterior a',
        dateAfter: 'La fecha es posterior a',
        clear: 'Limpiar',
        apply: 'Aplicar',
        matchAll: 'Coincide con todos',
        matchAny: 'Coincide con alguno',
        addRule: 'Agregar regla',
        removeRule: 'Quitar regla',
        accept: 'Sí',
        reject: 'No',
        choose: 'Elegir',
        completed: 'Completado',
        upload: 'Subir',
        cancel: 'Cancelar',
        pending: 'Pendiente',
        fileSizeTypes: ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        dayNames: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
        dayNamesShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
        dayNamesMin: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
        monthNames: [
          'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
          'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
        ],
        monthNamesShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
        chooseYear: 'Elegir año',
        chooseMonth: 'Elegir mes',
        chooseDate: 'Elegir fecha',
        prevDecade: 'Década anterior',
        nextDecade: 'Década siguiente',
        prevYear: 'Año anterior',
        nextYear: 'Año siguiente',
        prevMonth: 'Mes anterior',
        nextMonth: 'Mes siguiente',
        prevHour: 'Hora anterior',
        nextHour: 'Hora siguiente',
        prevMinute: 'Minuto anterior',
        nextMinute: 'Minuto siguiente',
        prevSecond: 'Segundo anterior',
        nextSecond: 'Segundo siguiente',
        am: 'a. m.',
        pm: 'p. m.',
        dateFormat: 'dd/mm/yy',
        firstDayOfWeek: 1,
        today: 'Hoy',
        weekHeader: 'Sem',
        weak: 'Débil',
        medium: 'Media',
        strong: 'Fuerte',
        passwordPrompt: 'Ingresá una contraseña',
        emptyMessage: 'No se encontraron resultados',
        searchMessage: 'Hay resultados de búsqueda disponibles',
        selectionMessage: '{0} elementos seleccionados',
        emptySelectionMessage: 'Ningún elemento seleccionado',
        emptySearchMessage: 'No se encontraron resultados',
        emptyFilterMessage: 'No se encontraron resultados',
        fileChosenMessage: 'Archivos',
        noFileChosenMessage: 'Ningún archivo elegido',
        aria: {
          trueLabel: 'Verdadero',
          falseLabel: 'Falso',
          nullLabel: 'No seleccionado',
          star: '1 estrella',
          stars: '{star} estrellas',
          selectAll: 'Todos los elementos seleccionados',
          unselectAll: 'Todos los elementos deseleccionados',
          close: 'Cerrar',
          previous: 'Anterior',
          next: 'Siguiente',
          navigation: 'Navegación',
          scrollTop: 'Volver arriba',
          moveTop: 'Mover al principio',
          moveUp: 'Mover arriba',
          moveDown: 'Mover abajo',
          moveBottom: 'Mover al final',
          moveToTarget: 'Mover al destino',
          moveToSource: 'Mover al origen',
          moveAllToTarget: 'Mover todo al destino',
          moveAllToSource: 'Mover todo al origen',
          pageLabel: '{page}',
          firstPageLabel: 'Primera página',
          lastPageLabel: 'Última página',
          nextPageLabel: 'Página siguiente',
          prevPageLabel: 'Página anterior',
          rowsPerPageLabel: 'Filas por página',
          previousPageLabel: 'Página anterior',
          jumpToPageDropdownLabel: 'Ir a la página (desplegable)',
          jumpToPageInputLabel: 'Ir a la página (campo)',
          selectRow: 'Fila seleccionada',
          unselectRow: 'Fila deseleccionada',
          expandRow: 'Fila expandida',
          collapseRow: 'Fila colapsada',
          showFilterMenu: 'Mostrar menú de filtro',
          hideFilterMenu: 'Ocultar menú de filtro',
          filterOperator: 'Operador de filtro',
          filterConstraint: 'Condición de filtro',
          editRow: 'Editar fila',
          saveEdit: 'Guardar edición',
          cancelEdit: 'Cancelar edición',
          listView: 'Vista de lista',
          gridView: 'Vista de grilla',
          slide: 'Diapositiva',
          slideNumber: '{slideNumber}',
          zoomImage: 'Ampliar imagen',
          zoomIn: 'Acercar',
          zoomOut: 'Alejar',
          rotateRight: 'Rotar a la derecha',
          rotateLeft: 'Rotar a la izquierda',
          listLabel: 'Lista de opciones',
          selectColor: 'Elegí un color',
          removeLabel: 'Quitar',
          browseFiles: 'Explorar archivos',
          maximizeLabel: 'Maximizar',
          minimizeLabel: 'Minimizar',
        },
      },
    }),
  ],
};
