import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class EvaluateRulesDto {
  @IsOptional()
  @IsUUID()
  ideProduct?: string;

  @IsOptional()
  @IsUUID()
  idePlanProductRisk?: string;

  @IsUUID()
  ideCoveragePlan!: string;

  /** 'Quote' = TQuoteRisk/TQuoteCoverage. 'Contract' = TFileRisk/TCoverageMovement. */
  @IsIn(['Quote', 'Contract'])
  origin!: 'Quote' | 'Contract';

  /** TQuoteRisk.IdeQuoteRisk (Quote) o TFileRisk.IdeFileRisk (Contract). */
  @IsUUID()
  ideOriginRisk!: string;

  /** TQuoteCoverage.IdeQuoteCoverage (Quote) o TCoverageMovement.IdeCoverageMovement (Contract). */
  @IsUUID()
  ideCoverageOrMovement!: string;
}
