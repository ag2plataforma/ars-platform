import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateProductRequirementDto {
  @IsOptional()
  @IsString()
  codProcess?: string;

  /** '' limpia a NULL, string la fija, undefined no la toca -- mismo criterio que `UpdateProductProcessFlowDto`. */
  @IsOptional()
  @IsString()
  codOperation?: string;

  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsOptional()
  @IsString()
  codPlanProduct?: string;

  @IsOptional()
  @IsString()
  codRiskProduct?: string;

  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;

  @IsOptional()
  @IsString()
  codClaimType?: string;

  @IsOptional()
  @IsString()
  codClaimEvent?: string;

  @IsOptional()
  @IsString()
  codRequirement?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsBoolean()
  indMandatory?: boolean;

  @IsOptional()
  @IsBoolean()
  indReviewable?: boolean;

  @IsOptional()
  @IsString()
  codRequirementType?: string;

  @IsOptional()
  @IsString()
  codDocumentType?: string;

  @IsOptional()
  @IsBoolean()
  indApplyOCR?: boolean;

  /**
   * Pista (texto libre) de qué datos debe buscar la IA en el documento de este
   * requisito, p. ej. "nombre, número de documento, fecha de nacimiento".
   * Solo se usa en la extracción con IA (Fase 4) y si `indApplyOCR` está activo.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  desExtractionHint?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
