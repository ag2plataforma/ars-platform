/** Fila genérica de un catálogo simple del backend (`CatalogCrudService`). Cada
 * catálogo tiene sus propios nombres de campo (`CodGender`/`DesGender`, etc.),
 * por eso el resto de los campos se acceden dinámicamente vía `CatalogConfig`. */
export interface CatalogRow {
  SState?: { CodState: string; DesState: string };
  [key: string]: unknown;
}

export type CatalogFieldType = 'text' | 'textarea' | 'select';

/** Campo adicional (más allá de código/descripción) que necesitan algunos
 * catálogos -- hoy solo `SCountry` (código DDI + idioma). El resto de los
 * catálogos simples no tiene ninguno. */
export interface CatalogExtraField {
  /** Nombre del campo tal como lo espera el DTO del backend (ej. `codLanguage`). */
  key: string;
  label: string;
  type: CatalogFieldType;
  required?: boolean;
  /** Si es `true`, el campo se edita en el formulario pero no se muestra
   * como columna en la tabla del listado (pensado para `desLarge`: texto
   * largo que ensuciaría la tabla, ver punto 2 en docs/02-roadmap.md). */
  hideInList?: boolean;
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
 * componente genérico de catálogo plano. Catálogos de referencia
 * transversales (no específicos de producto) -- pantalla "Catálogos"
 * (`/catalogos`). Los catálogos propios de la configuración de un
 * producto viven aparte, en `PRODUCT_CATALOG_REGISTRY` más abajo --
 * decisión explícita del usuario al notar que mezclar los 23 en una sola
 * pantalla la volvía inmanejable (ver `docs/02-roadmap.md`). */
export const COMMON_CATALOG_REGISTRY: CatalogConfig[] = [
  {
    key: 'languages',
    label: 'catalogsRegistry.languages.label',
    singular: 'catalogsRegistry.languages.singular',
    path: '/reference-data/languages',
    codField: 'CodLanguage',
    desField: 'DesLanguage',
    idField: 'IdeLanguage',
  },
  {
    key: 'genders',
    label: 'catalogsRegistry.genders.label',
    singular: 'catalogsRegistry.genders.singular',
    path: '/reference-data/genders',
    codField: 'CodGender',
    desField: 'DesGender',
    idField: 'IdeGender',
  },
  {
    key: 'marital-statuses',
    label: 'catalogsRegistry.marital-statuses.label',
    singular: 'catalogsRegistry.marital-statuses.singular',
    path: '/reference-data/marital-statuses',
    codField: 'CodMaritalStatus',
    desField: 'DesMaritalStatus',
    idField: 'IdeMaritalStatus',
  },
  {
    key: 'professions',
    label: 'catalogsRegistry.professions.label',
    singular: 'catalogsRegistry.professions.singular',
    path: '/reference-data/professions',
    codField: 'CodProfession',
    desField: 'DesProfession',
    idField: 'IdeProfession',
  },
  {
    key: 'business-activities',
    label: 'catalogsRegistry.business-activities.label',
    singular: 'catalogsRegistry.business-activities.singular',
    path: '/reference-data/business-activities',
    codField: 'CodBusinessActivity',
    desField: 'DesBusinessActivity',
    idField: 'IdeBusinessActivity',
  },
  {
    key: 'identification-types',
    label: 'catalogsRegistry.identification-types.label',
    singular: 'catalogsRegistry.identification-types.singular',
    path: '/reference-data/identification-types',
    codField: 'CodIdentificationType',
    desField: 'DesIdentificationType',
    idField: 'IdeIdentificationType',
  },
  {
    key: 'relationships',
    label: 'catalogsRegistry.relationships.label',
    singular: 'catalogsRegistry.relationships.singular',
    path: '/reference-data/relationships',
    codField: 'CodRelationship',
    desField: 'DesRelationship',
    idField: 'IdeRelationship',
  },
  {
    key: 'contact-classes',
    label: 'catalogsRegistry.contact-classes.label',
    singular: 'catalogsRegistry.contact-classes.singular',
    path: '/reference-data/contact-classes',
    codField: 'CodContactClass',
    desField: 'DesContactClass',
    idField: 'IdeContactClass',
  },
  {
    key: 'countries',
    label: 'catalogsRegistry.countries.label',
    singular: 'catalogsRegistry.countries.singular',
    path: '/reference-data/countries',
    codField: 'CodCountry',
    desField: 'DesCountry',
    idField: 'IdeCountry',
    extraFields: [
      { key: 'codDDI', label: 'catalogFields.codDDI', type: 'text', required: false },
      {
        key: 'codLanguage',
        label: 'catalogFields.codLanguage',
        type: 'select',
        required: true,
        optionsPath: '/reference-data/languages',
        optionCodField: 'CodLanguage',
        optionDesField: 'DesLanguage',
        columnRelation: 'SLanguage',
      },
    ],
  },
  {
    key: 'broker-types',
    label: 'catalogsRegistry.broker-types.label',
    singular: 'catalogsRegistry.broker-types.singular',
    path: '/party/broker-types',
    codField: 'CodBrokerType',
    desField: 'DesBrokerType',
    idField: 'IdeBrokerType',
  },
];

/** Catálogos propios de la configuración de un producto: los 8 simples +
 * Coberturas de `product-rating-service`, Conceptos/Tipos de concepto de
 * `reference-data-service` (requeridos por `SCalculationRule.CodConcept`)
 * y canal/vía de distribución de `party-service`. Separado de
 * `COMMON_CATALOG_REGISTRY` -- pantalla "Catálogos de producto"
 * (`/configuracion-productos/catalogos`), agrupada en el menú bajo
 * "Configuración de productos" junto con Productos y Tablas de tarifa.
 * Decisión explícita del usuario: la pantalla de Catálogos genérica se
 * había vuelto inmanejable con los 23 catálogos juntos. */
export const PRODUCT_CATALOG_REGISTRY: CatalogConfig[] = [
  // --- product-rating-service: 8 catálogos simples + Coberturas (ver su
  // README, sección "CRUD real de los 8 catálogos simples"/"7 entidades
  // de dominio"). Prerequisito de Cotización (docs/02-roadmap.md). ---
  {
    key: 'risk-levels',
    label: 'catalogsRegistry.risk-levels.label',
    singular: 'catalogsRegistry.risk-levels.singular',
    path: '/product-rating/risk-levels',
    codField: 'CodRiskLevel',
    desField: 'DesRiskLevel',
    idField: 'IdeRiskLevel',
    extraFields: [
      { key: 'desShort', label: 'catalogFields.desShort', type: 'text', required: false },
      { key: 'desLarge', label: 'catalogFields.desLarge', type: 'textarea', required: false, hideInList: true },
    ],
  },
  {
    key: 'risks',
    label: 'catalogsRegistry.risks.label',
    singular: 'catalogsRegistry.risks.singular',
    path: '/product-rating/risks',
    codField: 'CodRisk',
    desField: 'DesRisk',
    idField: 'IdeRisk',
    extraFields: [
      {
        key: 'codRiskLevel',
        label: 'catalogFields.codRiskLevel',
        type: 'select',
        required: true,
        optionsPath: '/product-rating/risk-levels',
        optionCodField: 'CodRiskLevel',
        optionDesField: 'DesRiskLevel',
        columnRelation: 'SRiskLevel',
      },
    ],
  },
  {
    key: 'risk-types',
    label: 'catalogsRegistry.risk-types.label',
    singular: 'catalogsRegistry.risk-types.singular',
    path: '/product-rating/risk-types',
    codField: 'CodRiskType',
    desField: 'DesRiskType',
    idField: 'IdeRiskType',
  },
  {
    key: 'currencies',
    label: 'catalogsRegistry.currencies.label',
    singular: 'catalogsRegistry.currencies.singular',
    path: '/product-rating/currencies',
    codField: 'CodCurrency',
    desField: 'DesCurrency',
    idField: 'IdeCurrency',
    extraFields: [{ key: 'symbolCurrency', label: 'catalogFields.symbolCurrency', type: 'text', required: true }],
  },
  {
    key: 'insurance-areas',
    label: 'catalogsRegistry.insurance-areas.label',
    singular: 'catalogsRegistry.insurance-areas.singular',
    path: '/product-rating/insurance-areas',
    codField: 'CodInsuranceArea',
    desField: 'DesInsuranceArea',
    idField: 'IdeInsuranceArea',
    extraFields: [
      { key: 'desShort', label: 'catalogFields.desShort', type: 'text', required: false },
      { key: 'desLarge', label: 'catalogFields.desLarge', type: 'textarea', required: false, hideInList: true },
    ],
  },
  {
    key: 'insurance-lines',
    label: 'catalogsRegistry.insurance-lines.label',
    singular: 'catalogsRegistry.insurance-lines.singular',
    path: '/product-rating/insurance-lines',
    codField: 'CodInsuranceLine',
    desField: 'DesInsuranceLine',
    idField: 'IdeInsuranceLine',
    extraFields: [
      {
        key: 'codInsuranceArea',
        label: 'catalogFields.codInsuranceArea',
        type: 'select',
        required: true,
        optionsPath: '/product-rating/insurance-areas',
        optionCodField: 'CodInsuranceArea',
        optionDesField: 'DesInsuranceArea',
        columnRelation: 'SInsuranceArea',
      },
      { key: 'desShort', label: 'catalogFields.desShort', type: 'text', required: false },
      { key: 'desLarge', label: 'catalogFields.desLarge', type: 'textarea', required: false, hideInList: true },
    ],
  },
  {
    key: 'deductible-types',
    label: 'catalogsRegistry.deductible-types.label',
    singular: 'catalogsRegistry.deductible-types.singular',
    path: '/product-rating/deductible-types',
    codField: 'CodDeductibleType',
    desField: 'DesDeductibleType',
    idField: 'IdeDeductibleType',
  },
  {
    key: 'limit-types',
    label: 'catalogsRegistry.limit-types.label',
    singular: 'catalogsRegistry.limit-types.singular',
    path: '/product-rating/limit-types',
    codField: 'CodLimitType',
    desField: 'DesLimitType',
    idField: 'IdeLimitType',
  },
  {
    key: 'coverages',
    label: 'catalogsRegistry.coverages.label',
    singular: 'catalogsRegistry.coverages.singular',
    path: '/product-rating/coverages',
    codField: 'CodCoverage',
    desField: 'DesCoverage',
    idField: 'IdeCoverage',
    extraFields: [
      {
        key: 'codInsuranceLine',
        label: 'catalogFields.codInsuranceLine',
        type: 'select',
        required: true,
        optionsPath: '/product-rating/insurance-lines',
        optionCodField: 'CodInsuranceLine',
        optionDesField: 'DesInsuranceLine',
        columnRelation: 'SInsuranceLine',
      },
    ],
  },

  // --- reference-data-service: SConceptType/SConcept, prerequisito de
  // SCalculationRule.CodConcept (ver CommonCatalogsModule). ---
  {
    key: 'concept-types',
    label: 'catalogsRegistry.concept-types.label',
    singular: 'catalogsRegistry.concept-types.singular',
    path: '/reference-data/concept-types',
    codField: 'CodConceptType',
    desField: 'DesConceptType',
    idField: 'IdeConceptType',
  },
  {
    key: 'concepts',
    label: 'catalogsRegistry.concepts.label',
    singular: 'catalogsRegistry.concepts.singular',
    path: '/reference-data/concepts',
    codField: 'CodConcept',
    desField: 'DesConcept',
    idField: 'IdeConcept',
    extraFields: [
      {
        key: 'codConceptType',
        label: 'catalogFields.codConceptType',
        type: 'select',
        required: true,
        optionsPath: '/reference-data/concept-types',
        optionCodField: 'CodConceptType',
        optionDesField: 'DesConceptType',
        columnRelation: 'SConceptType',
      },
      { key: 'desShort', label: 'catalogFields.desShort', type: 'text', required: false },
      { key: 'desLarge', label: 'catalogFields.desLarge', type: 'textarea', required: false, hideInList: true },
    ],
  },

  // --- party-service: catálogos de distribución (canal/vía), el otro
  // prerequisito de Cotización -- ver DistributionModule. ---
  {
    key: 'channel-types',
    label: 'catalogsRegistry.channel-types.label',
    singular: 'catalogsRegistry.channel-types.singular',
    path: '/party/channel-types',
    codField: 'CodChannelType',
    desField: 'DesChannelType',
    idField: 'IdeChannelType',
  },
  {
    key: 'distribution-ways',
    label: 'catalogsRegistry.distribution-ways.label',
    singular: 'catalogsRegistry.distribution-ways.singular',
    path: '/party/distribution-ways',
    codField: 'CodDistributionWay',
    desField: 'DesDistributionWay',
    idField: 'IdeDistributionWay',
  },
  {
    key: 'distribution-channels',
    label: 'catalogsRegistry.distribution-channels.label',
    singular: 'catalogsRegistry.distribution-channels.singular',
    path: '/party/distribution-channels',
    codField: 'CodDistributionChannel',
    desField: 'DesDistributionChannel',
    idField: 'IdeDistributionChannel',
    extraFields: [
      {
        key: 'codChannelType',
        label: 'catalogFields.codChannelType',
        type: 'select',
        required: false,
        optionsPath: '/party/channel-types',
        optionCodField: 'CodChannelType',
        optionDesField: 'DesChannelType',
        columnRelation: 'SChannelType',
      },
    ],
  },
];


/** Catálogos simples del motor de flujo configurable (`SStep`/`SScreen`/
 * `SProcessFlow`) -- pantalla "Flujos de proceso" (`/flujos-de-proceso/catalogos`),
 * agrupada en el menú junto con "Pasos de flujo" y "Asignación por
 * producto" (ver `product-process-flows.component.ts`). `SScreen` no
 * expone `screenContent` acá -- ver el doc-comment de `ScreensService`
 * en reference-data-service: es JSON libre, "efectivamente sin uso" para
 * esta primera vuelta del motor (decisión explícita del usuario,
 * 2026-09-23), así que el generic-catalog-form no lo edita (el backend
 * lo deja en `{}` por defecto). */
export const PROCESS_FLOW_CATALOG_REGISTRY: CatalogConfig[] = [
  {
    key: 'steps',
    label: 'catalogsRegistry.steps.label',
    singular: 'catalogsRegistry.steps.singular',
    path: '/reference-data/steps',
    codField: 'CodStep',
    desField: 'DesStep',
    idField: 'IdeStep',
  },
  {
    key: 'screens',
    label: 'catalogsRegistry.screens.label',
    singular: 'catalogsRegistry.screens.singular',
    path: '/reference-data/screens',
    codField: 'CodScreen',
    desField: 'DesScreen',
    idField: 'IdeScreen',
  },
  {
    key: 'process-flows',
    label: 'catalogsRegistry.process-flows.label',
    singular: 'catalogsRegistry.process-flows.singular',
    path: '/reference-data/process-flows',
    codField: 'CodProcessFlow',
    desField: 'DesProcessFlow',
    idField: 'IdeProcessFlow',
  },
];
