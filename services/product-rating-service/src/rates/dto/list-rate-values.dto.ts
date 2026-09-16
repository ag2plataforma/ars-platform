import { IsOptional, IsString } from 'class-validator';

export class ListRateValuesDto {
  @IsOptional()
  @IsString()
  codRateTable?: string;
}
