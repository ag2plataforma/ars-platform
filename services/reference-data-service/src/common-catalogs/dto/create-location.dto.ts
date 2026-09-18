import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateLocationDto {
  /**
   * NO es único global -- el original solo exige unicidad de
   * (`CodLocation`, `IdeCountry`) -- confirmado en el esquema
   * (`UK_SLocation_01`). El mismo código puede repetirse en países
   * distintos.
   */
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codLocation solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codLocation!: string;

  @IsString()
  desLocation!: string;

  /** CodCountry del país al que pertenece (opcional -- ej. una región sin país asignado todavía). */
  @IsOptional()
  @IsString()
  codCountry?: string;

  /** CodLocation de la ubicación padre, para armar la jerarquía (opcional). */
  @IsOptional()
  @IsString()
  codLocationParent?: string;
}
