import { RiskAttributeField } from './risk-attributes.service';
import { CollectiveInsuredPayload } from './quoting.service';

/** Una fila de asegurado en pantalla: los datos a enviar + los errores de validación de la fila. */
export interface InsuredRow {
  /** Identificador local (no se envía). */
  key: number;
  codIdentificationType: string;
  numIdentification: string;
  desFirstName: string;
  desLastName1: string;
  desLastName2: string;
  desEmail: string;
  tstBirthdate: string;
  /** `{ [IdeAttributeProperty]: valor }`. */
  attrs: Record<string, unknown>;
  errors: string[];
}

export const BASE_COLUMNS = [
  'tipo_documento',
  'numero_documento',
  'nombre',
  'apellido1',
  'apellido2',
  'email',
  'fecha_nacimiento',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Encabezados de la plantilla: columnas base + una por campo personalizado (con su etiqueta). */
export function templateHeaders(fields: RiskAttributeField[]): string[] {
  return [...BASE_COLUMNS, ...fields.map((f) => f.label)];
}

/** Contenido de la plantilla CSV (`;` como separador, con BOM para que Excel lo abra en UTF-8). */
export function buildTemplateCsv(fields: RiskAttributeField[], sample: string[]): string {
  const lines = [templateHeaders(fields).join(';'), sample.join(';')];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Parte un CSV en filas de celdas, respetando comillas; detecta `;` o `,` por la cabecera. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Convierte las filas del CSV en `InsuredRow`. Las columnas se identifican por su encabezado
 * (sin importar el orden); las que no se reconocen se ignoran. Devuelve además los errores de
 * estructura (columnas obligatorias que faltan).
 */
export function csvToInsuredRows(
  table: string[][],
  fields: RiskAttributeField[],
  identificationTypeCodes: string[],
  startKey: number,
): { rows: InsuredRow[]; structureErrors: string[] } {
  if (table.length < 2) {
    return { rows: [], structureErrors: ['El archivo no tiene filas de asegurados (solo cabecera o vacío).'] };
  }
  const header = table[0].map(normalize);
  const col = (name: string) => header.indexOf(normalize(name));
  const baseIdx = Object.fromEntries(BASE_COLUMNS.map((c) => [c, col(c)])) as Record<(typeof BASE_COLUMNS)[number], number>;
  const structureErrors: string[] = [];
  for (const required of ['nombre', 'email'] as const) {
    if (baseIdx[required] < 0) structureErrors.push(`Falta la columna obligatoria "${required}".`);
  }
  const fieldIdx = fields.map((f) => ({ field: f, idx: col(f.label) }));
  for (const { field, idx } of fieldIdx) {
    const required = field.validators?.some((v) => v.validationName === 'required');
    if (required && idx < 0) structureErrors.push(`Falta la columna obligatoria "${field.label}".`);
  }
  if (structureErrors.length > 0) return { rows: [], structureErrors };

  const get = (cells: string[], idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '');

  const rows = table.slice(1).map((cells, i) => {
    const row: InsuredRow = {
      key: startKey + i,
      codIdentificationType: get(cells, baseIdx.tipo_documento),
      numIdentification: get(cells, baseIdx.numero_documento),
      desFirstName: get(cells, baseIdx.nombre),
      desLastName1: get(cells, baseIdx.apellido1),
      desLastName2: get(cells, baseIdx.apellido2),
      desEmail: get(cells, baseIdx.email),
      tstBirthdate: get(cells, baseIdx.fecha_nacimiento),
      attrs: {},
      errors: [],
    };
    for (const { field, idx } of fieldIdx) {
      const raw = get(cells, idx);
      row.attrs[field.ideAttributeProperty] = convertAttributeValue(field, raw);
    }
    const canonical = identificationTypeCodes.find((c) => normalize(c) === normalize(row.codIdentificationType));
    if (canonical) row.codIdentificationType = canonical;
    row.errors = validateInsuredRow(row, fields, identificationTypeCodes);
    return row;
  });
  return { rows, structureErrors: [] };
}

/** Convierte el texto de una celda al valor que espera el motor de atributos según el tipo de campo. */
function convertAttributeValue(field: RiskAttributeField, raw: string): unknown {
  switch (field.type) {
    case 'select':
    case 'radio': {
      if (!raw) return null;
      const match = (field.options ?? []).find((o) => normalize(String(o.key)) === normalize(raw));
      return match ? match.value : `__invalid__:${raw}`;
    }
    case 'checkbox':
      return ['si', 'sí', 'true', '1', 'x', 'yes'].includes(normalize(raw));
    case 'number': {
      if (raw === '') return null;
      const n = Number(raw.replace(',', '.'));
      return Number.isNaN(n) ? `__invalid__:${raw}` : n;
    }
    default:
      return raw === '' ? null : raw;
  }
}

/** Valida una fila (identidad + atributos). Devuelve la lista de mensajes de error (vacía = válida). */
export function validateInsuredRow(row: InsuredRow, fields: RiskAttributeField[], identificationTypeCodes: string[]): string[] {
  const errors: string[] = [];
  if (!row.desFirstName.trim()) errors.push('Falta el nombre.');
  if (!row.desEmail.trim()) errors.push('Falta el email.');
  else if (!EMAIL_RE.test(row.desEmail.trim())) errors.push(`Email inválido "${row.desEmail}".`);
  if (row.numIdentification.trim() && !row.codIdentificationType.trim()) {
    errors.push('Si se indica el documento hay que indicar su tipo.');
  }
  if (
    row.codIdentificationType.trim() &&
    !identificationTypeCodes.some((c) => normalize(c) === normalize(row.codIdentificationType))
  ) {
    errors.push(`Tipo de documento desconocido "${row.codIdentificationType}".`);
  }
  if (row.tstBirthdate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.tstBirthdate.trim())) {
    errors.push(`Fecha de nacimiento "${row.tstBirthdate}" no válida (usa AAAA-MM-DD).`);
  }
  for (const field of fields) {
    const value = row.attrs[field.ideAttributeProperty];
    if (typeof value === 'string' && value.startsWith('__invalid__:')) {
      errors.push(`"${field.label}": valor no válido "${value.slice('__invalid__:'.length)}".`);
      continue;
    }
    for (const validator of field.validators ?? []) {
      const props = validator.aditionalProps ?? {};
      const empty = value === null || value === undefined || value === '';
      if (validator.validationName === 'required' && empty) errors.push(`"${field.label}" es obligatorio.`);
      if (!empty && typeof value === 'number') {
        if (validator.validationName === 'min' && typeof props['min'] === 'number' && value < props['min']) {
          errors.push(`"${field.label}" debe ser como mínimo ${props['min']}.`);
        }
        if (validator.validationName === 'max' && typeof props['max'] === 'number' && value > props['max']) {
          errors.push(`"${field.label}" debe ser como máximo ${props['max']}.`);
        }
      }
      if (!empty && typeof value === 'string' && validator.validationName === 'maxLength' && typeof props['maxLength'] === 'number' && value.length > props['maxLength']) {
        errors.push(`"${field.label}" admite como máximo ${props['maxLength']} caracteres.`);
      }
    }
  }
  // Duplicados dentro del propio archivo se detectan fuera (necesitan ver el resto de filas).
  return errors;
}

/** Marca como error los correos/documentos repetidos dentro de la lista. */
export function flagDuplicates(rows: InsuredRow[]): InsuredRow[] {
  const emails = new Map<string, number>();
  const docs = new Map<string, number>();
  return rows.map((row, index) => {
    const errors = row.errors.filter((e) => !e.startsWith('Duplicado:'));
    const email = row.desEmail.trim().toLowerCase();
    if (email) {
      if (emails.has(email)) errors.push(`Duplicado: el email ya está en la fila ${emails.get(email)}.`);
      else emails.set(email, index + 1);
    }
    const doc = `${row.codIdentificationType.trim().toLowerCase()}|${row.numIdentification.trim().toLowerCase()}`;
    if (row.numIdentification.trim()) {
      if (docs.has(doc)) errors.push(`Duplicado: el documento ya está en la fila ${docs.get(doc)}.`);
      else docs.set(doc, index + 1);
    }
    return { ...row, errors };
  });
}

/** Fila lista para enviar al backend. */
export function toPayload(row: InsuredRow): CollectiveInsuredPayload {
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row.attrs)) {
    if (value !== null && value !== undefined && value !== '') attrs[key] = value;
  }
  return {
    codIdentificationType: row.codIdentificationType.trim() || undefined,
    numIdentification: row.numIdentification.trim() || undefined,
    desFirstName: row.desFirstName.trim(),
    desLastName1: row.desLastName1.trim() || undefined,
    desLastName2: row.desLastName2.trim() || undefined,
    desEmail: row.desEmail.trim(),
    tstBirthdate: row.tstBirthdate.trim() || undefined,
    riskAttributeValue: Object.keys(attrs).length > 0 ? attrs : undefined,
  };
}
