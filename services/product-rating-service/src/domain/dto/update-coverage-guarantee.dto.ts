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

export class UpdateCoverageGuaranteeDto {
  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;

  @IsOptional()
  @IsString()
  codGuarantee?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;

  @IsOptional()
  @IsBoolean()
  indCoverageAccumulate?: boolean;

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
  @IsNumber()
  @Min(0)
  numApplyUse?: number;

  @IsOptional()
  @IsInt()
  order?: number;
}
