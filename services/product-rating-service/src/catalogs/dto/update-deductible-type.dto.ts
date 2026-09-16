import { IsOptional, IsString } from 'class-validator';

export class UpdateDeductibleTypeDto {
  @IsOptional()
  @IsString()
  desDeductibleType?: string;
}
