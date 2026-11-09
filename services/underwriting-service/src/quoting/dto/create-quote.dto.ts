import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { CreateQuoteRiskDto } from './create-quote-risk.dto';

export class CreateQuoteDto {
  /** CodProduct del producto que se está cotizando (debe existir). */
  @IsString()
  codProduct!: string;

  /**
   * CodDistributionChannel del nodo comercial de la cotización (debe existir). Solo hace falta si el usuario NO tiene
   * nodo asignado en su `UserData`: si lo tiene, se usa siempre el suyo.
   */
  @IsOptional()
  @IsString()
  codDistributionChannel?: string;

  /** CodDistributionWay de la vía de distribución (debe existir). */
  @IsString()
  codDistributionWay!: string;

  /**
   * Valores de los campos de nivel producto (comunes a todos los riesgos, ej. dias de viaje), como
   * `{ "<IdeAttributeProperty>": "<valor o IdeFieldValue>" }`. Se guardan en `TQuote.GenericAttributeValue`.
   */
  @IsOptional()
  @IsObject()
  genericAttributeValue?: Record<string, string>;

  /**
   * Fecha de inicio de la vigencia (`YYYY-MM-DD`). Opcional: sin ella la póliza empieza al contratarse. No puede ser
   * anterior a hoy.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tstInitial debe tener formato YYYY-MM-DD' })
  tstInitial?: string;

  /**
   * Fecha de fin de la vigencia (`YYYY-MM-DD`). SOLO productos de vigencia temporal; excluyente con `validityDays`.
   * Debe ser posterior al inicio.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tstEnd debe tener formato YYYY-MM-DD' })
  tstEnd?: string;

  /**
   * Cantidad de días de vigencia, contados desde el inicio (fin = inicio + días). SOLO productos de vigencia
   * temporal; excluyente con `tstEnd`.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3660)
  validityDays?: number;

  /** Al menos un riesgo a cotizar (ej. una mascota, un smartphone). */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteRiskDto)
  risks!: CreateQuoteRiskDto[];
}
