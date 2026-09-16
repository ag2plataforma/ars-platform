import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateRiskProductDto {
  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsOptional()
  @IsString()
  codRisk?: string;

  @IsOptional()
  @IsString()
  codRiskType?: string;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;
}
