import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateRiskDto {
  @IsOptional()
  @IsString()
  desRisk?: string;

  @IsOptional()
  @IsString()
  codRiskLevel?: string;

  @IsOptional()
  @IsBoolean()
  indPersonRisk?: boolean;
}
