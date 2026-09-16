import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateInsuranceAreaDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codInsuranceArea solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codInsuranceArea!: string;

  @IsString()
  desInsuranceArea!: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  /** CodInsuranceArea del ramo padre, para armar la jerarquía (opcional). */
  @IsOptional()
  @IsString()
  codInsuranceAreaParent?: string;
}
