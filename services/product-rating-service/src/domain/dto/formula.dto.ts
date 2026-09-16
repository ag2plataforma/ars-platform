import { IsString } from 'class-validator';

/**
 * Forma exacta que `RulesEngineService`/`PrismaCalculationRuleRepository`
 * esperan en `SCalculationRule.FormulaJSON` (claves `IF`/`THEN`/`ELSE`,
 * ver `packages/database/src/repositories/calculation-rule.repository.ts`).
 * Se valida acá, al guardar, en vez de descubrir un JSON mal formado
 * recién cuando el motor de reglas intenta evaluarlo.
 */
export class FormulaDto {
  @IsString()
  if!: string;

  @IsString()
  then!: string;

  @IsString()
  else!: string;
}
