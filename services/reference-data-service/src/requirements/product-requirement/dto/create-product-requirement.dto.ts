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
 * `IdeCoverageGuarantee`/`IdeClaimType`/`IdeClaimEvent` (columnas reales
 * de `SProductRequirement` ligadas a Siniestros) NO se exponen en este
 * DTO -- quedan siempre NULL en esta etapa (alcance acordado con el
 * usuario 2026-09-24: "Solo Cotización/Contratación por ahora", Fase 4
 * -- Siniestros -- decide después si necesita su propio flujo).
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
