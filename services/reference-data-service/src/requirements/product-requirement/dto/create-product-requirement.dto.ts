import { IsBoolean, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Ver el doc-comment de `ProductRequirementService` para el análisis
 * completo. Resolución de FKs por código, mismo patrón que
 * `CreateProductProcessFlowDto` -- excepto `ideCoveragePlan`, que va
 * directo por id porque `SCoveragePlan` no tiene código propio (mismo
 * motivo que `ListCoveragePlansDto.idePlanProductRisk` en
 * `product-rating-service`: se resuelve en la pantalla con un selector
 * en cascada Plan -> Riesgo -> Cobertura, no escribiendo un código a
 * mano).
 *
 * `codClaimType`/`codClaimEvent` (Fase 4 -- Siniestros, 2026-09-24):
 * agregados para que el admin pueda configurar requisitos exigidos por
 * siniestro (`ClaimRequirementsService` en `claims-service` los resuelve
 * filtrando por `IdeClaimType`/`IdeClaimEvent`, NO por `IdeProcess`). Una
 * fila de siniestro sigue necesitando un `codProcess` porque la columna
 * es NOT NULL -- convención de esta implementación (no confirmada con el
 * usuario): usar `GENERICO`, ver el doc-comment de
 * `ClaimRequirementsService`. `IdeCoverageGuarantee` (columna real de
 * `SProductRequirement`, de Etapa 2 -- garantías) sigue sin exponerse.
 */
export class CreateProductRequirementDto {
  /** CodProcess del proceso al que aplica (ej. COTIZACION/CONTRATACION; debe existir). */
  @IsString()
  codProcess!: string;

  /** CodOperation opcional (comodín NULL si se omite). */
  @IsOptional()
  @IsString()
  codOperation?: string;

  /** CodProduct del producto al que aplica (debe existir). */
  @IsString()
  codProduct!: string;

  /** CodPlanProduct opcional -- comodín NULL si se omite (aplica a cualquier plan). */
  @IsOptional()
  @IsString()
  codPlanProduct?: string;

  /** CodRiskProduct opcional -- comodín NULL si se omite (aplica a cualquier riesgo). */
  @IsOptional()
  @IsString()
  codRiskProduct?: string;

  /** IdeCoveragePlan opcional -- comodín NULL si se omite (aplica a cualquier cobertura). */
  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;

  /** CodClaimType opcional -- comodín NULL si se omite (fila sin alcance de Siniestros, ver doc-comment de la clase). */
  @IsOptional()
  @IsString()
  codClaimType?: string;

  /** CodClaimEvent opcional -- comodín NULL si se omite (aplica a cualquier evento de ese tipo de siniestro). */
  @IsOptional()
  @IsString()
  codClaimEvent?: string;

  /** CodRequirement del documento exigido (debe existir). */
  @IsString()
  codRequirement!: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsBoolean()
  indMandatory!: boolean;

  @IsBoolean()
  indReviewable!: boolean;

  /** Texto libre (ej. "DOCUMENTO", "FORMULARIO") -- no hay catálogo propio todavía. */
  @IsString()
  codRequirementType!: string;

  /** Texto libre (ej. "PDF", "IMAGEN") -- no hay catálogo propio todavía. */
  @IsString()
  codDocumentType!: string;

  /** Reservado para Etapa 2 (OCR real) -- se guarda pero no dispara ninguna ejecución todavía. */
  @IsBoolean()
  indApplyOCR!: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}
