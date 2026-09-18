import { IsOptional, IsString } from 'class-validator';

export class UpdateApplicationRoleDto {
  @IsOptional()
  @IsString()
  desApplicationRole?: string;
}
