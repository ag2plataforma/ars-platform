import { IsOptional, IsString } from 'class-validator';

export class UpdateEndorsementReasonDto {
  @IsOptional()
  @IsString()
  desEndorsementReason?: string;
}
