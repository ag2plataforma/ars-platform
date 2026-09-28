import { IsOptional, IsString } from 'class-validator';

export class UpdateEndorsementDto {
  @IsOptional()
  @IsString()
  desEndorsement?: string;
}
