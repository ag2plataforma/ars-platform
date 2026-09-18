import { IsOptional, IsString } from 'class-validator';

export class ListCommissionsDto {
  @IsOptional()
  @IsString()
  codCommissionTable?: string;
}
