import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

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

  /** Colectivos: el producto se vende como colectivo (un tomador, N asegurados). Ver `setup-collectives.js`. */
  @IsOptional()
  @IsBoolean()
  indCollective?: boolean;

  /** `POR_CERTIFICADO` (cada asegurado paga su prima) o `UNICA` (prima única, reservada para una etapa posterior). */
  @IsOptional()
  @IsIn(['POR_CERTIFICADO', 'UNICA'])
  codCollectivePremiumMode?: 'POR_CERTIFICADO' | 'UNICA';
}
