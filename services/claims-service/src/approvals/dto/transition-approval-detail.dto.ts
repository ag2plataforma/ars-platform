import { IsIn } from 'class-validator';

/** Códigos operativos válidos para `TApprovalDetail` (ver `seed-claims-approval-workflow.js`). */
export type ApprovalDetailOperative = 'APROBAR' | 'RECHAZAR' | 'ESCALAR';

export class TransitionApprovalDetailDto {
  @IsIn(['APROBAR', 'RECHAZAR', 'ESCALAR'])
  codOperative!: ApprovalDetailOperative;
}
