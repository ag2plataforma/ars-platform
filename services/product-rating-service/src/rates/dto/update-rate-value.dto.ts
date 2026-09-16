import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateRateValueDto {
  @IsOptional()
  @IsString()
  codRateTable?: string;

  @IsOptional()
  @IsDateString()
  tstInit?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;

  @IsOptional()
  @IsString()
  factor1?: string;

  @IsOptional()
  @IsString()
  factor2?: string;

  @IsOptional()
  @IsString()
  factor3?: string;

  @IsOptional()
  @IsString()
  factor4?: string;

  @IsOptional()
  @IsString()
  factor5?: string;

  @IsOptional()
  @IsString()
  value?: string;
}
