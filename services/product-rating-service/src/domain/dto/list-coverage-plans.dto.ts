import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListCoveragePlansDto {
  @IsOptional()
  @IsUUID()
  idePlanProductRisk?: string;

  @IsOptional()
  @IsString()
  codCoverage?: string;
}
