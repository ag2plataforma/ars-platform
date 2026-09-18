import { IsOptional, IsString } from 'class-validator';

export class UpdateIdentificationTypeDto {
  @IsOptional()
  @IsString()
  desIdentificationType?: string;
}
