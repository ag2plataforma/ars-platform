/**
 * Normaliza un numero de documento antes de guardarlo o compararlo: quita espacios de los extremos y pasa las
 * letras a MAYUSCULAS (ej. `06809020r` -> `06809020R`). No toca guiones ni puntos. Las busquedas ademas comparan
 * sin distinguir mayusculas, para encontrar tambien los documentos guardados antes de esta normalizacion.
 */
export function normalizeIdentification(value: string): string;
export function normalizeIdentification(value: string | null | undefined): string | undefined;
export function normalizeIdentification(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : undefined;
}
