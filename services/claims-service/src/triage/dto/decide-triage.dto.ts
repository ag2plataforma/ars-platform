import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CLAIM_PRIORITIES, ClaimPriority } from '../claim-triage.constants';

/** Decisión humana sobre el triage: confirma o cambia la prioridad sugerida por la IA. */
export class DecideTriageDto {
  @IsIn(CLAIM_PRIORITIES as unknown as string[])
  codPriority!: ClaimPriority;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
