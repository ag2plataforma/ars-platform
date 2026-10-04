import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateProductPaymentFractionDto {
  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  porSurCharge?: number;
}
