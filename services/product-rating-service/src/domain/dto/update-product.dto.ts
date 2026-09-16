import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  desProduct?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  codInsuranceArea?: string;

  @IsOptional()
  @IsString()
  codCurrency?: string;

  @IsOptional()
  @IsInt()
  validityDays?: number;

  @IsOptional()
  @IsString()
  codStartTime?: string;

  @IsOptional()
  @IsBoolean()
  indGenerateAllFraction?: boolean;

  @IsOptional()
  @IsBoolean()
  indProportionalPrime?: boolean;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;
}
