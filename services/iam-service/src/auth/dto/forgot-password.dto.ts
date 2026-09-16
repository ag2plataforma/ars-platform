import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  /** userName = email de login (misma convención que v1). */
  @IsEmail()
  userName!: string;
}
