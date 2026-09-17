import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePersonRoleDto {
  @IsString()
  codPersonRol!: string;

  @IsString()
  desPersonRol!: string;

  @IsOptional()
  @IsUUID()
  ideTextContent?: string;
}
