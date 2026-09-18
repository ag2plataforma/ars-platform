import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateCountryDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codCountry solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codCountry!: string;

  @IsString()
  desCountry!: string;

  /** Código de discado internacional, ej. "+58". Opcional. */
  @IsOptional()
  @IsString()
  codDDI?: string;

  /** CodLanguage del idioma por defecto del país. */
  @IsString()
  codLanguage!: string;
}
