/**
 * Helpers genéricos de archivo, compartidos entre features que suben o
 * descargan un archivo real contra el backend (Etapa 2 de "Requisitos",
 * docs/02-roadmap.md ítem 4: Cotización y Contrato necesitan exactamente
 * lo mismo). A diferencia de otros tipos duplicados a propósito en este
 * proyecto por capas de dependencia (ver `core/party/persons.service.ts`),
 * esto es utilería pura sin reglas de negocio -- no hay motivo para
 * duplicarla.
 */

/** Convierte un `File` elegido por el usuario a base64 (sin el prefijo
 *  `data:...;base64,`) -- mismo criterio que `CreateTemplateDto.fileBase64`
 *  en documents-service: viaja así (no multipart) para pasar sin cambios
 *  por el proxy del gateway. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Dispara la descarga de un `Blob` ya obtenido (`responseType: 'blob'`)
 *  con el nombre de archivo real -- mismo patrón ya usado en
 *  `contract-documents.component.ts` (descarga del PDF generado). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
}
