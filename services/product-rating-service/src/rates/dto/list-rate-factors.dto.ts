import { IsOptional, IsString } from 'class-validator';

export class ListRateFactorsDto {
  @IsOptional()
  @IsString()
  codRateTable?: string;
}
