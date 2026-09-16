import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdatePlanProductDto {
  @IsOptional()
  @IsString()
  desPlanProduct?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;
}
