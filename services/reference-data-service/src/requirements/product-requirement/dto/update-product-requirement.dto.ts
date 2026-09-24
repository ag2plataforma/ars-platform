import { IsBoolean, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

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

  @IsOptional()
  @IsInt()
  order?: number;
}
