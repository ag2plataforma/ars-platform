import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateQuoteRiskDto {
  /** CodRiskProduct del riesgo a cotizar (debe existir). */
  @IsString()
  codRiskProduct!: string;

  /**
   * Valores de atributos personalizables para este riesgo, como
   * `{ "<IdeAttributeProperty>": "<valor o IdeFieldValue>" }` -- mismo
   * formato confirmado contra datos reales de `RiskAttributeValue` en
   * `packages/database/scripts/investigate-quote-engine.js` (ej. fecha
   * de compra como texto, o el id de un `SFieldValue` para un campo tipo
   * selección). Las claves son ids de `SAttributeProperty` (ver
   * `AttributeEngineModule` en `reference-data-service`) -- no se
   * validan acá contra esa tabla, queda para una fase posterior de
   * validación de formulario dinámico.
   */
  @IsOptional()
  @IsObject()
  riskAttributeValue?: Record<string, string>;
}
