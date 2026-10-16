import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateRiskTypeDto {
  @IsOptional()
  @IsString()
  desRiskType?: string;

  @IsOptional()
  @IsBoolean()
  indPersonRisk?: boolean;
}
