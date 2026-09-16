import { IsOptional, IsString } from 'class-validator';

export class ListPlanProductRisksDto {
  @IsOptional()
  @IsString()
  codPlanProduct?: string;

  @IsOptional()
  @IsString()
  codRiskProduct?: string;
}
