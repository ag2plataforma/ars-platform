import { IsEmail, IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codUser solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codUser!: string;

  /** Se usa también como email de login y de recuperación de contraseña (misma convención que v1). */
  @IsEmail()
  userName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  codRol!: string;

  @IsOptional()
  @IsObject()
  userData?: Record<string, unknown>;
}
