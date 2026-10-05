import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateValidityTypeDto {
  @IsOptional()
  @IsString()
  desValidityType?: string;

  @IsOptional()
  @IsBoolean()
  indAnnual?: boolean;
}
