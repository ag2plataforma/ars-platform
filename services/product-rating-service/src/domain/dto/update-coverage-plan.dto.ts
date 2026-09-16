import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdateCoveragePlanDto {
  @IsOptional()
  @IsUUID()
  idePlanProductRisk?: string;

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
  @IsBoolean()
  indMandatory?: boolean;

  @IsOptional()
  @IsBoolean()
  getPrime?: boolean;

  @IsOptional()
  @IsBoolean()
  refundPrime?: boolean;

  @IsOptional()
  @IsBoolean()
  proratedGetPrime?: boolean;

  @IsOptional()
  @IsBoolean()
  proratedRefundPrime?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  numMonthsWaitingPeriod?: number;

  @IsOptional()
  @IsBoolean()
  indSplitPayment?: boolean;

  @IsOptional()
  @IsString()
  codDeductibleType?: string;

  @IsOptional()
  @IsNumber()
  deductibleTypeValue?: number;

  @IsOptional()
  @IsString()
  codLimitType?: string;

  @IsOptional()
  @IsNumber()
  limitTypeValue?: number;

  @IsOptional()
  @IsBoolean()
  indPayPerUse?: boolean;

  @IsOptional()
  @IsBoolean()
  indFixedAmount?: boolean;

  @IsOptional()
  @IsNumber()
  lowerAmount?: number;

  @IsOptional()
  @IsNumber()
  upperAmount?: number;

  @IsOptional()
  @IsBoolean()
  indFixedRate?: boolean;

  @IsOptional()
  @IsNumber()
  lowerRate?: number;

  @IsOptional()
  @IsNumber()
  upperRate?: number;

  @IsOptional()
  @IsBoolean()
  indFixedPrime?: boolean;

  @IsOptional()
  @IsNumber()
  lowerPrime?: number;

  @IsOptional()
  @IsNumber()
  upperPrime?: number;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;

  @IsOptional()
  inclusiveCoverage?: unknown;

  @IsOptional()
  exclusiveCoverage?: unknown;

  @IsOptional()
  @IsInt()
  order?: number;
}
