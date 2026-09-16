import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdatePlanProductRiskDto {
  @IsOptional()
  @IsString()
  codPlanProduct?: string;

  @IsOptional()
  @IsString()
  codRiskProduct?: string;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;
}
