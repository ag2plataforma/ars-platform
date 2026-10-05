import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateProductValidityTypeDto {
  @IsOptional()
  @IsBoolean()
  indInitialDate?: boolean;
}
