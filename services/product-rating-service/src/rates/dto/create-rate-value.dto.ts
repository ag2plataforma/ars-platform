import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateRateValueDto {
  /**
   * CodRateTable de la tabla a la que pertenece esta fila. La columna es
   * nullable en el esquema, pero un valor sin tabla no tiene uso de
   * negocio — se recomienda siempre enviarlo.
   */
  @IsOptional()
  @IsString()
  codRateTable?: string;

  @IsDateString()
  tstInit!: string;

  @IsDateString()
  tstEnd!: string;

  /** NULL/omitido = comodín, no filtra por esta dimensión (ver SRateFactor para qué representa cada Factor). */
  @IsOptional()
  @IsString()
  factor1?: string;

  @IsOptional()
  @IsString()
  factor2?: string;

  @IsOptional()
  @IsString()
  factor3?: string;

  @IsOptional()
  @IsString()
  factor4?: string;

  @IsOptional()
  @IsString()
  factor5?: string;

  @IsOptional()
  @IsString()
  value?: string;
}
