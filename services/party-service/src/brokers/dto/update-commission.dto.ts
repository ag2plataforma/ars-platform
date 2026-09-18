import { IsDateString, IsNumber, IsOptional } from 'class-validator';

export class UpdateCommissionDto {
  @IsOptional()
  @IsNumber()
  percentaje?: number;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;
}
