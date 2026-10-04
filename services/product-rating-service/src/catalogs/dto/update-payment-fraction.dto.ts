import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdatePaymentFractionDto {
  @IsOptional()
  @IsString()
  desPaymentFraction?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  numFraction?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  numOrder?: number;
}
