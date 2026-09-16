import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  userName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /** "Recordarme" — token de larga duración (ver JWT_EXTENDED_EXPIRES_IN). */
  @IsOptional()
  @IsBoolean()
  extendedTokenDuration?: boolean;
}
