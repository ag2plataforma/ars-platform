import { IsOptional, IsString } from 'class-validator';

export class UpdateCoverageDto {
  @IsOptional()
  @IsString()
  desCoverage?: string;

  @IsOptional()
  @IsString()
  codInsuranceLine?: string;
}
