import { IsEmail, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  userName?: string;

  @IsOptional()
  @IsString()
  codRol?: string;

  @IsOptional()
  @IsObject()
  userData?: Record<string, unknown>;
}
