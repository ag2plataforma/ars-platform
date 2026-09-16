import { IsOptional, IsString } from 'class-validator';

export class UpdateLimitTypeDto {
  @IsOptional()
  @IsString()
  desLimitType?: string;
}
