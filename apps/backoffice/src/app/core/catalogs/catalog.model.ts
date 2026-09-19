/** Fila genérica de un catálogo simple del backend (`CatalogCrudService`). Cada
 * catálogo tiene sus propios nombres de campo (`CodGender`/`DesGender`, etc.),
 * por eso el resto de los campos se acceden dinámicamente vía `CatalogConfig`. */
export interface CatalogRow {
  SState?: { CodState: string; DesState: string };
  [key: string]: unknown;
}

export type CatalogFieldType = 'text' | 'select';

/** Campo adicional (más allá de código/descripción) que necesitan algunos
 * catálogos -- hoy solo `SCountry` (código DDI + idioma). El resto de los
 * catálogos simples no tiene ninguno. */
export interface CatalogExtraField {
  /** Nombre del campo tal como lo espera el DTO del backend (ej. `codLanguage`). */
  key: string;
  label: string;
  type: CatalogFieldType;
  required?: boolean;
  /** Solo para `type: 'select'`: catálogo (por `path`) del que salen las opciones. */
  optionsPath?: string;
  optionCodField?: string;
  optionDesField?: string;
  /** Solo para `type: 'select'`: relación incluida en la fila para mostrar en la tabla sin resolver aparte (ej. `SLanguage`). */
  columnRelation?: string;
}

export interface CatalogConfig {
  key: string;
  /** Nombre en plural, para el menú y el título. */
  label: string;
  /** Nombre en singular, para mensajes ("país creado", "no se pudo eliminar el país"). */
  singular: string;
  /** Path relativo al gateway, ej. `/reference-data/genders`. */
  path: string;
  codField: string;
  desField: string;
  idField: string;
  extraFields?: CatalogExtraField[];
}

function toCamel(field: string): string {
  return field.charAt(0).toLowerCase() + field.slice(1);
}

export function codKey(config: CatalogConfig): string {
  return toCamel(config.codField);
}

export function desKey(config: CatalogConfig): string {
  return toCamel(config.desField);
}

/** Nombre del campo tal como viene en la fila del backend (PascalCase) para
 * un `CatalogExtraField` simple sin relación (ej. `codDDI` -> `CodDDI`). */
export function extraRowField(field: CatalogExtraField): string {
  return field.key.charAt(0).toUpperCase() + field.key.slice(1);
}

/** Los 8 catálogos "simples" de `CommonCatalogsModule` (mismo shape exacto:
 * código único + descripción + estado) más `SCountry` (con idioma como FK).
 * `SLocation` queda deliberadamente afuera de este registro -- ver
 * `docs/02-roadmap.md`: es jerárquico y su unicidad es compuesta
 * (`CodLocation`+`IdeCountry`), amerita una pantalla propia en vez de este
 * componente genérico de catálogo plano. */
export const CATALOG_REGISTRY: CatalogConfig[] = [
  {
    key: 'languages',
    label: 'Idiomas',
    singular: 'idioma',
    path: '/reference-data/languages',
    codField: 'CodLanguage',
    desField: 'DesLanguage',
    idField: 'IdeLanguage',
  },
  {
    key: 'genders',
    label: 'Géneros',
    singular: 'género',
    path: '/reference-data/genders',
    codField: 'CodGender',
    desField: 'DesGender',
    idField: 'IdeGender',
  },
  {
    key: 'marital-statuses',
    label: 'Estado civil',
    singular: 'estado civil',
    path: '/reference-data/marital-statuses',
    codField: 'CodMaritalStatus',
    desField: 'DesMaritalStatus',
    idField: 'IdeMaritalStatus',
  },
  {
    key: 'professions',
    label: 'Profesiones',
    singular: 'profesión',
    path: '/reference-data/professions',
    codField: 'CodProfession',
    desField: 'DesProfession',
    idField: 'IdeProfession',
  },
  {
    key: 'business-activities',
    label: 'Actividad económica',
    singular: 'actividad económica',
    path: '/reference-data/business-activities',
    codField: 'CodBusinessActivity',
    desField: 'DesBusinessActivity',
    idField: 'IdeBusinessActivity',
  },
  {
    key: 'identification-types',
    label: 'Tipos de identificación',
    singular: 'tipo de identificación',
    path: '/reference-data/identification-types',
    codField: 'CodIdentificationType',
    desField: 'DesIdentificationType',
    idField: 'IdeIdentificationType',
  },
  {
    key: 'relationships',
    label: 'Parentescos',
    singular: 'parentesco',
    path: '/reference-data/relationships',
    codField: 'CodRelationship',
    desField: 'DesRelationship',
    idField: 'IdeRelationship',
  },
  {
    key: 'contact-classes',
    label: 'Tipos de contacto',
    singular: 'tipo de contacto',
    path: '/reference-data/contact-classes',
    codField: 'CodContactClass',
    desField: 'DesContactClass',
    idField: 'IdeContactClass',
  },
  {
    key: 'countries',
    label: 'Países',
    singular: 'país',
    path: '/reference-data/countries',
    codField: 'CodCountry',
    desField: 'DesCountry',
    idField: 'IdeCountry',
    extraFields: [
      { key: 'codDDI', label: 'Código DDI', type: 'text', required: false },
      {
        key: 'codLanguage',
        label: 'Idioma',
        type: 'select',
        required: true,
        optionsPath: '/reference-data/languages',
        optionCodField: 'CodLanguage',
        optionDesField: 'DesLanguage',
        columnRelation: 'SLanguage',
      },
    ],
  },
];
