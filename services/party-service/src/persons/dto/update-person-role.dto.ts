import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdatePersonRoleDto {
  @IsOptional()
  @IsString()
  desPersonRol?: string;

  @IsOptional()
  @IsUUID()
  ideTextContent?: string;
}
