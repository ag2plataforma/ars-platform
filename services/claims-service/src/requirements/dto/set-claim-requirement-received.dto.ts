import { IsDateString, IsOptional } from 'class-validator';

/** Body opcional -- si no se manda `tstReception`, se usa `new Date()` (recepción "ahora mismo"). */
export class SetClaimRequirementReceivedDto {
  @IsOptional()
  @IsDateString()
  tstReception?: string;
}
