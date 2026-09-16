import { IsOptional, IsUUID } from 'class-validator';

export class ApplicableRulesQueryDto {
  @IsOptional()
  @IsUUID()
  ideProduct?: string;

  @IsOptional()
  @IsUUID()
  idePlanProductRisk?: string;

  @IsUUID()
  ideCoveragePlan!: string;
}
