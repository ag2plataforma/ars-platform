import { IsOptional, IsString } from 'class-validator';

export class UpdateRateTableDto {
  @IsOptional()
  @IsString()
  desRateTable?: string;
}
