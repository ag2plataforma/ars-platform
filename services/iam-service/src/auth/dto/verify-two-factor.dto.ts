import { IsString } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsString()
  twoFactorToken!: string;

  /** Código TOTP de 6 dígitos o un código de respaldo -- ambos válidos acá. */
  @IsString()
  code!: string;
}
