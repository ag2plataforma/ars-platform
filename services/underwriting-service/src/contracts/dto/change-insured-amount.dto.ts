import { IsDateString, IsNumber, IsPositive, IsString } from 'class-validator';

/**
 * Parámetros del suplemento "Cambio de monto asegurado" (ver
 * `ContractsService.changeInsuredAmount`, Etapa 2 del ítem 1 del roadmap
 * -- "Gestión de movimientos y suplementos del contrato"). Mismo criterio
 * de campos obligatorios que `CancelContractDto`.
 *
 * `ideProductEndorsement` cumple el mismo doble rol que en la anulación:
 * de ahí sale la operación a registrar (`SOperationProduct.IdeProductEndorsement`)
 * -- acá, sembrada como una operación nueva, no `ANULGENE`/`RECEGENE`.
 * A diferencia de la anulación, no se lee `ConditionData` para decidir si
 * recalcular la prima -- un cambio de monto SIEMPRE recalcula (ver
 * `ContractsService.setSupplementPrime`), no es condicional.
 */
export class ChangeInsuredAmountDto {
  @IsString()
  ideRiskCoverage!: string;

  @IsNumber()
  @IsPositive()
  newAmount!: number;

  @IsString()
  ideProductEndorsement!: string;

  @IsDateString()
  tstSupplement!: string;

  @IsString()
  desSupplement!: string;
}
