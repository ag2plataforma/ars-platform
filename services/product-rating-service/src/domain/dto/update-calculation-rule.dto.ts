import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { FormulaDto } from './formula.dto';

/**
 * No permite volver a poner en NULL (comodín) `codProduct`/`idePlanProductRisk`
 * una vez fijados — para eso hay que borrar la regla y crearla de nuevo.
 * Cubre el caso real (ajustar fórmula, orden, o mover la regla a otra
 * cobertura/concepto), no el de "quitar" un filtro de jerarquía ya puesto.
 */
export class UpdateCalculationRuleDto {
  @IsOptional()
  @IsString()
  desCalculationRule?: string;

  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsOptional()
  @IsUUID()
  idePlanProductRisk?: string;

  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;

  @IsOptional()
  @IsString()
  codConcept?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsString()
  codEntityReference?: string;

  @IsOptional()
  @IsString()
  desColumnName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FormulaDto)
  formula?: FormulaDto;
}
