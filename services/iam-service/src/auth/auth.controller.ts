import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { CurrentUser, JwtPayload, Public } from '@ars-platform/shared-common';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfirmTwoFactorDto } from './dto/confirm-two-factor.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.userName, dto.password, dto.extendedTokenDuration);
  }

  /** Requiere estar autenticado (no lleva @Public()) — cambia la propia contraseña. */
  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Public()
  @HttpCode(200)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(dto.userName);
    // Mensaje genérico siempre, exista o no el usuario (evita enumeración).
    return { message: 'Si el usuario existe, se envió un correo con instrucciones.' };
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /** Segundo paso del login cuando la respuesta de `POST /login` trae `requiresTwoFactor: true`. */
  @Public()
  @HttpCode(200)
  @Post('2fa/verify')
  verifyTwoFactor(@Body() dto: VerifyTwoFactorDto) {
    return this.authService.verifyTwoFactor(dto.twoFactorToken, dto.code);
  }

  /** Genera un secreto nuevo (queda "pendiente" hasta `2fa/confirm`) y el QR/URI para la app autenticadora. Requiere estar logueado -- 2FA es autoservicio. */
  @HttpCode(200)
  @Post('2fa/enroll')
  enrollTwoFactor(@CurrentUser() user: JwtPayload) {
    return this.twoFactorService.startEnrollment(user.sub, user.code);
  }

  /** Confirma el enrolamiento con un código real de la app y devuelve los 10 códigos de respaldo (solo se muestran esta vez). */
  @HttpCode(200)
  @Post('2fa/confirm')
  async confirmTwoFactor(@CurrentUser() user: JwtPayload, @Body() dto: ConfirmTwoFactorDto) {
    const backupCodes = await this.twoFactorService.confirmEnrollment(user.sub, dto.code);
    return { backupCodes };
  }

  /** Apaga 2FA sobre la propia cuenta -- exige reingresar la contraseña Y un código válido (TOTP o de respaldo), no solo estar logueado. */
  @HttpCode(200)
  @Post('2fa/disable')
  async disableTwoFactor(@CurrentUser() user: JwtPayload, @Body() dto: DisableTwoFactorDto) {
    await this.authService.assertPasswordMatches(user.sub, dto.password);
    const validCode = await this.twoFactorService.verifyCode(user.sub, dto.code);
    if (!validCode) {
      throw new UnauthorizedException('Código de verificación incorrecto');
    }
    await this.twoFactorService.disable(user.sub);
    return { ok: true };
  }
}
