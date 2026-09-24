import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Todos opcionales -- `''` en un campo de FK opcional lo limpia a NULL, mismo criterio que `UpdateProductRequirementDto`. */
export class UpdateClaimTypeDto {
  @IsOptional()
  @IsString()
  desClaimType?: string;

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
  @IsString()
  codCoverage?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  numClaimsPerYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  initialProvisionAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  numDeadLineReport?: number;

  @IsOptional()
  @IsInt()
  order?: number;
}
