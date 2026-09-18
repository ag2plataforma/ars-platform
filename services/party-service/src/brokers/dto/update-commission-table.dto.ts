import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateCommissionTableDto {
  @IsOptional()
  @IsString()
  desCommissionTable?: string;

  @IsOptional()
  @IsString()
  codCommissionTree?: string;

  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsOptional()
  @IsUUID()
  idePlanProductRisk?: string;

  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;
}
