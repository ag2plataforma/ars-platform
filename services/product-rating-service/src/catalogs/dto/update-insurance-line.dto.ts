import { IsOptional, IsString } from 'class-validator';

export class UpdateInsuranceLineDto {
  @IsOptional()
  @IsString()
  desInsuranceLine?: string;

  @IsOptional()
  @IsString()
  codInsuranceArea?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;
}
