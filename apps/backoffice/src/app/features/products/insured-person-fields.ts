/** Datos de persona que un producto puede pedir para el asegurado de un riesgo de tipo persona. */
export const INSURED_PERSON_FIELDS = [
  'firstName',
  'middleName',
  'lastName1',
  'lastName2',
  'document',
  'birthdate',
  'gender',
  'maritalStatus',
  'profession',
  'birthPlace',
  'email',
] as const;

export type InsuredPersonField = (typeof INSURED_PERSON_FIELDS)[number];
export type InsuredFieldMode = 'NONE' | 'OPTIONAL' | 'REQUIRED';
export type InsuredPersonConfig = Record<InsuredPersonField, InsuredFieldMode>;

/** Minimo por defecto: nombre, primer apellido, documento y fecha de nacimiento (igual que el backend). */
export const DEFAULT_INSURED_PERSON_CONFIG: InsuredPersonConfig = {
  firstName: 'REQUIRED',
  middleName: 'NONE',
  lastName1: 'REQUIRED',
  lastName2: 'NONE',
  document: 'REQUIRED',
  birthdate: 'REQUIRED',
  gender: 'NONE',
  maritalStatus: 'NONE',
  profession: 'NONE',
  birthPlace: 'NONE',
  email: 'NONE',
};

/** Normaliza lo guardado en `SProduct.ObjInsuredPersonFields` (null = minimo por defecto; el nombre es siempre obligatorio). */
export function resolveInsuredPersonConfig(raw: unknown): InsuredPersonConfig {
  const config: InsuredPersonConfig = { ...DEFAULT_INSURED_PERSON_CONFIG };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const field of INSURED_PERSON_FIELDS) {
      const value = (raw as Record<string, unknown>)[field];
      if (value === 'NONE' || value === 'OPTIONAL' || value === 'REQUIRED') config[field] = value;
    }
  }
  config.firstName = 'REQUIRED';
  return config;
}
