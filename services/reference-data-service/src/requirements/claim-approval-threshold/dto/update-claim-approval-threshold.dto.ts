import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateClaimApprovalThresholdDto {
  @IsOptional()
  @IsString()
  codProduct?: string;

  /** '' limpia a NULL, string la fija, undefined no la toca -- mismo criterio que `UpdateProductRequirementDto`. */
  @IsOptional()
  @IsString()
  codPlanProduct?: string;

  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;

  @IsOptional()
  @IsString()
  codCurrency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  /** null explícito limpia el techo (sin límite); undefined no la toca. */
  @IsOptional()
  @IsNumber()
  maxAmount?: number | null;

  @IsOptional()
  @IsString()
  codRol?: string;
}
