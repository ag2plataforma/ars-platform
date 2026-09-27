import { IsIn } from 'class-validator';

/**
 * Códigos operativos válidos para la transición MANUAL de `TClaimFile`
 * (ver `ClaimsService.transitionClaimFileState`). Deliberadamente NO
 * incluye 'APROBAR'/'RECHAZAR' (las decide `ApprovalsService` sola,
 * según el resultado real de la aprobación) ni 'PAGAR' (la decide
 * `ClaimPaymentsService` sola, al registrar el pago) -- ver sus
 * doc-comments.
 */
export type ClaimFileOperative = 'ENVIAR_A_REVISION' | 'ENVIAR_A_EVALUACION' | 'CERRAR' | 'REABRIR';

export class TransitionClaimFileDto {
  @IsIn(['ENVIAR_A_REVISION', 'ENVIAR_A_EVALUACION', 'CERRAR', 'REABRIR'])
  codOperative!: ClaimFileOperative;
}
