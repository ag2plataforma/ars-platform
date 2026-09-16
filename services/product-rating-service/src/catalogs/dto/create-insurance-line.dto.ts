import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateInsuranceLineDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codInsuranceLine solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codInsuranceLine!: string;

  @IsString()
  desInsuranceLine!: string;

  /** CodInsuranceArea del ramo al que pertenece (debe existir). */
  @IsString()
  codInsuranceArea!: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;
}
