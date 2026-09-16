import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, ValidateNested } from 'class-validator';
import { FormulaDto } from './formula.dto';

export class CreateCalculationRuleDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codCalculationRule solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codCalculationRule!: string;

  @IsString()
  desCalculationRule!: string;

  /**
   * CodProduct del producto (nivel más general de la jerarquía). Omitir
   * para que la regla aplique a cualquier producto (comodín NULL, ver
   * `FQuoteCoverageConcept` en `docs/01-especificacion-motor-negocio-actual.md`, §3).
   */
  @IsOptional()
  @IsString()
  codProduct?: string;

  /**
   * `SPlanProductRisk` no tiene código propio — se referencia por id
   * (devuelto al crear la relación en `/plan-product-risks`). Omitir
   * para el comodín NULL de ese nivel.
   */
  @IsOptional()
  @IsUUID()
  idePlanProductRisk?: string;

  /** `SCoveragePlan` tampoco tiene código propio, y este nivel es obligatorio (NOT NULL en BD). */
  @IsUUID()
  ideCoveragePlan!: string;

  /** CodConcept del concepto que esta regla calcula (debe existir). */
  @IsString()
  codConcept!: string;

  /** Orden de evaluación dentro de la cadena — de esto depende que `rule('COD')` vea el valor correcto. */
  @IsInt()
  order!: number;

  /** Código de `SEntity` (no se resuelve a id — la FK real es por código). */
  @IsOptional()
  @IsString()
  codEntityReference?: string;

  /** Si viene, el resultado actualiza esta columna en vez de insertar un concepto nuevo. */
  @IsOptional()
  @IsString()
  desColumnName?: string;

  @ValidateNested()
  @Type(() => FormulaDto)
  formula!: FormulaDto;
}
