import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Parámetros opcionales de `FContract('CONTRACTNEW', ...)` -- la cotización
 * de origen viaja en la URL (`POST /quotes/:id/contract`), no en el body.
 *
 * `codPaymentFraction`: si no se especifica, se usa la primera
 * `SProductPaymentFraction` activa y vigente del producto (orden por
 * `NumOrder` de `SPaymentFraction`) -- el original no tiene un DTO
 * explícito para esto (era un parámetro de la función PL/pgSQL), acá se
 * expone para no forzar siempre la fracción "por defecto" del producto.
 *
 * `initialDate`: si no se especifica, se usa `now()` -- igual criterio
 * que el original para productos con `SProductValidityType.IndInitialDate`
 * en false.
 */
export class CreateContractDto {
  @IsOptional()
  @IsString()
  codPaymentFraction?: string;

  @IsOptional()
  @IsDateString()
  initialDate?: string;

  /**
   * Valores de los campos de nivel producto de etapa CONTRACT (solo se piden al contratar), como
   * `{ "<IdeAttributeProperty>": valor }`. Se mezclan con los de la cotizacion (PRICING) en
   * `TContractFile.GenericAttributeValue`.
   */
  @IsOptional()
  @IsObject()
  genericAttributeValue?: Record<string, string>;
}
