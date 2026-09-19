import { IsString } from 'class-validator';

export class DisableTwoFactorDto {
  @IsString()
  password!: string;

  /** Código TOTP de 6 dígitos o un código de respaldo -- ambos válidos acá. */
  @IsString()
  code!: string;
}
