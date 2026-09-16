import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codProduct solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codProduct!: string;

  @IsString()
  desProduct!: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsString()
  image?: string;

  /** CodInsuranceArea del ramo al que pertenece (debe existir). */
  @IsString()
  codInsuranceArea!: string;

  /** CodCurrency de la moneda base del producto (debe existir). */
  @IsString()
  codCurrency!: string;

  @IsOptional()
  @IsInt()
  validityDays?: number;

  /** Código de negocio (no catálogo en BD) para el criterio de inicio de vigencia, ej. "EMISSION". */
  @IsString()
  codStartTime!: string;

  @IsBoolean()
  indGenerateAllFraction!: boolean;

  /** Si se omite, queda el default de BD (true). */
  @IsOptional()
  @IsBoolean()
  indProportionalPrime?: boolean;

  @IsDateString()
  tstInitial!: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;
}
