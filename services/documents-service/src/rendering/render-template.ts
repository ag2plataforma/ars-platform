import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

/**
 * Parser de tags con soporte de ruta con punto (`{{tomador.desFirstName}}`).
 *
 * Corrección (2026-10-01): el parser por defecto de docxtemplater SOLO
 * resuelve claves planas contra el scope actual -- NO camina rutas con
 * punto por sí solo (confirmado contra la documentación oficial, sección
 * "deep dive into the parser option"). Como la plantilla real necesita
 * `tomador.X`/`titular.X` (objetos anidados, no aplanados), hace falta
 * este parser mínimo -- sigue siendo gratis/core, no es el módulo pago
 * de "Angular parser" (ese agrega expresiones completas tipo `a+b`, acá
 * solo hace falta caminar `a.b.c`).
 */
function pathParser(tag: string) {
  return {
    get(scope: unknown) {
      if (tag === '.') return scope;
      return tag.split('.').reduce<unknown>((value, key) => {
        if (value === null || value === undefined) return undefined;
        return (value as Record<string, unknown>)[key];
      }, scope);
    },
  };
}

/**
 * Rellena una plantilla .docx (bytes crudos) con `variables` usando
 * sintaxis `{{campo}}` dentro del propio documento Word -- misma idea
 * que `docxtpl` (Python) usaba en `ag2-printer-api` (v1), reemplazado
 * acá por `docxtemplater` (licencia MIT en su módulo base, uso comercial
 * libre -- confirmado antes de elegirlo) para quedar en el mismo stack
 * Node/TypeScript que el resto del monorepo.
 *
 * `delimiters: {{ }}` -- docxtemplater usa por defecto una sola llave
 * (`{campo}`); como las plantillas reales (heredadas del `ag2-printer-api`
 * viejo, que usaba Jinja2) ya vienen escritas con llave doble (`{{campo}}`),
 * se configura acá para que coincida, en vez de pedirle a cada plantilla
 * que se reescriba con llave simple.
 *
 * Los tags de loop/sección (`{{#lista}}...{{/lista}}`, para repetir una
 * fila de tabla por cada elemento de un array -- ver `GenerationService`
 * para los arrays `coverages`/`receipts`) SÍ son parte del módulo
 * core/gratuito de docxtemplater (confirmado contra la documentación
 * oficial).
 */
export function renderDocxTemplate(templateBytes: Buffer, variables: Record<string, unknown>): Buffer {
  const zip = new PizZip(templateBytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    parser: pathParser,
    // Variable sin valor -> string vacío en vez de lanzar error -- mismo
    // criterio de "dato no configurado no debe romper todo el proceso"
    // que ya se usa en el motor de fórmulas legado (FGetValueAttribute).
    nullGetter: () => '',
  });
  doc.render(variables);
  return doc.getZip().generate({ type: 'nodebuffer' });
}
