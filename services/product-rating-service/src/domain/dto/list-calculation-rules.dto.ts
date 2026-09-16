import { IsOptional, IsUUID } from 'class-validator';

export class ListCalculationRulesDto {
  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;
}
