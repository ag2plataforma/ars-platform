import { IsOptional, IsString } from 'class-validator';

export class UpdateRiskTypeDto {
  @IsOptional()
  @IsString()
  desRiskType?: string;
}
