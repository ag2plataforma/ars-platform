import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
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

  /** Al menos un riesgo a cotizar (ej. una mascota, un smartphone). */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteRiskDto)
  risks!: CreateQuoteRiskDto[];
}
