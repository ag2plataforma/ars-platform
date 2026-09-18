import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateCommissionTableDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codCommissionTable solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codCommissionTable!: string;

  @IsString()
  desCommissionTable!: string;

  /** Código de `SCommissionTree` al que pertenece esta tabla. */
  @IsString()
  codCommissionTree!: string;

  /** Código de `SProduct` -- la tabla aplica a este producto. */
  @IsString()
  codProduct!: string;

  /**
   * Comodín opcional: si se omite, la tabla aplica a cualquier
   * `SPlanProductRisk` del producto (ver `resolveCommissionPercentage`
   * en `underwriting-service`, que ya hace este match). Sin código
   * propio (tabla de unión) -- se referencia por id, obtenible vía
   * `GET /plan-product-risks` en `product-rating-service`.
   */
  @IsOptional()
  @IsUUID()
  idePlanProductRisk?: string;

  /**
   * Comodín opcional, mismo criterio que `idePlanProductRisk`. Sin
   * código propio -- se referencia por id, obtenible vía
   * `GET /coverage-plans` en `product-rating-service`.
   */
  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;
}
