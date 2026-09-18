import { IsOptional, IsString } from 'class-validator';

export class UpdateMaritalStatusDto {
  @IsOptional()
  @IsString()
  desMaritalStatus?: string;
}
