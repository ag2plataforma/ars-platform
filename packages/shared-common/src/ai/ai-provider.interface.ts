/**
 * Puerto de IA (mismo patrón que `SMS_SENDER`/`EMAIL_SENDER`): el resto del
 * sistema habla SOLO con esta interfaz y el proveedor concreto se elige por
 * `AI_PROVIDER` en el `.env` (`anthropic` real, `mock` para probar sin clave).
 * Las credenciales viven únicamente en el `.env`.
 *
 * Principios de la Fase 4 (acordados con el usuario): la IA SOLO propone, una
 * persona confirma; se envía lo mínimo necesario y cada llamada deja
 * trazabilidad (`TAiRequest`); `AI_ENABLED=false` la apaga por completo.
 */
export type AiConfidence = 'ALTA' | 'MEDIA' | 'BAJA';

export interface AiDocumentExtractionInput {
  fileName: string;
  /** Contenido binario del documento (PDF o imagen). */
  bytes: Buffer;
  /** Nombre del tipo de documento esperado (el requisito), como contexto. */
  requirementName: string;
  /** Pista opcional de qué datos buscar (texto libre configurado por producto). */
  hint?: string | null;
}

export interface AiExtractedField {
  /** Identificador corto (camelCase), p. ej. `numDocumento`. */
  key: string;
  /** Etiqueta legible, p. ej. "Número de documento". */
  label: string;
  value: string;
  confidence: AiConfidence;
}

export interface AiDocumentExtraction {
  /** Tipo de documento detectado por la IA (informativo). */
  documentType: string | null;
  fields: AiExtractedField[];
  /** Observaciones de la IA (ilegible, página en blanco...). */
  notes: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Petición genérica de "pregunta -> JSON estructurado" (triage, etc.). */
export interface AiStructuredRequest {
  system: string;
  prompt: string;
  /** Nombre de la herramienta que la IA debe "llamar" para devolver el JSON. */
  toolName: string;
  toolDescription: string;
  /** JSON Schema del objeto que debe devolver. */
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
  /** Solo lo usa el proveedor `mock`: la salida simulada a devolver. */
  mockOutput?: Record<string, unknown>;
}

export interface AiStructuredResult {
  /** Objeto devuelto por la IA; SIN validar: el llamador debe sanearlo. */
  output: Record<string, unknown>;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AiProvider {
  /** Código del proveedor (`anthropic`, `mock`, `none`). */
  readonly codProvider: string;
  /** `false` cuando la IA está apagada o sin configurar. */
  readonly enabled: boolean;
  /** Nombre del modelo en uso (para la trazabilidad). */
  readonly model: string;
  extractDocumentData(input: AiDocumentExtractionInput): Promise<AiDocumentExtraction>;
  /** Pregunta de texto con salida JSON forzada por esquema (la salida no se debe asumir válida). */
  completeStructured(request: AiStructuredRequest): Promise<AiStructuredResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/** Tamaños/tipos que aceptamos enviar a la IA. */
export type AiDocumentMediaType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

/** Detecta el tipo por los primeros bytes (no por la extensión, que el usuario controla). */
export function detectDocumentMediaType(bytes: Buffer): AiDocumentMediaType | null {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 6 && bytes.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  return null;
}
