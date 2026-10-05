import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { FormulaDto } from './formula.dto';

/** Body de `POST /calculation-rules/validate-formula` (backlog ítem 8,
 *  ver docs/02-roadmap.md) -- valida una `FormulaDto` SIN crear/editar
 *  ninguna `SCalculationRule`, para que la pantalla pueda chequearla
 *  antes de guardar. Reutiliza la misma `FormulaDto` que
 *  `CreateCalculationRuleDto`/`UpdateCalculationRuleDto`. */
export class ValidateFormulaDto {
  @ValidateNested()
  @Type(() => FormulaDto)
  formula!: FormulaDto;
}
