import { IsOptional, IsString } from 'class-validator';

export class ListCommissionTablesDto {
  @IsOptional()
  @IsString()
  codCommissionTree?: string;

  @IsOptional()
  @IsString()
  codProduct?: string;
}
