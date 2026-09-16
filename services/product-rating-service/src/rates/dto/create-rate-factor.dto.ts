import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRateFactorDto {
  /** CodRateTable de la tabla a la que pertenece este factor (debe existir). */
  @IsString()
  codRateTable!: string;

  /**
   * CodFieldDictionary del campo que este factor representa (ej. "EDAD",
   * "ZONA"). Opcional porque la columna lo es en el esquema, pero sin él
   * el factor no significa nada de negocio — se recomienda siempre enviarlo.
   */
  @IsOptional()
  @IsString()
  codFieldDictionary?: string;

  /** A qué columna Factor1..Factor5 de `SRateValue` corresponde (solo hay 5). */
  @IsInt()
  @Min(1)
  @Max(5)
  numOrder!: number;
}
