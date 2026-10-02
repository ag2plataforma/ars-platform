import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateAdjustmentDto {
  @IsOptional()
  @IsString()
  desAdjustment?: string;

  @IsOptional()
  @IsNumber()
  pctAdjustment?: number;

  @IsOptional()
  @IsBoolean()
  indAutomatic?: boolean;
}
