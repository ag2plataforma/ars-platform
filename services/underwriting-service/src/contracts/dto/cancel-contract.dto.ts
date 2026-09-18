import { IsDateString, IsString } from 'class-validator';

/**
 * Parámetros de `FContract('CANCELCONTRACT', ...)` -- los 4 son
 * obligatorios en el original (`raise exception 'Error. All parameters are
 * required...'` si falta alguno, ver el código real confirmado en
 * `packages/database/scripts/investigate-contract-engine.js`).
 *
 * `ideProductEndorsement`: identifica el endoso/suplemento de anulación
 * (`SProductEndorsement`) -- de ahí sale tanto la operación a registrar
 * (`SOperationProduct.IdeProductEndorsement`) como la configuración de
 * devolución de prima/comisión/impuesto (`ConditionData`, ver
 * `FMovementConcept('SetCancelPrime', ...)`).
 */
export class CancelContractDto {
  @IsString()
  ideProductEndorsement!: string;

  @IsDateString()
  tstCancellation!: string;

  @IsString()
  desCancellation!: string;
}
