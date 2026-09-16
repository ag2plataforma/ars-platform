import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateRateFactorDto {
  @IsOptional()
  @IsString()
  codFieldDictionary?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  numOrder?: number;
}
