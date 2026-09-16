import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService, TUserCredential } from '@ars-platform/database';
import { EMAIL_SENDER, EmailSender, JwtPayload } from '@ars-platform/shared-common';
import { compare, hash } from 'bcryptjs';

export interface LoginResult {
  token: string;
  codUser: string;
  userData: unknown;
}

interface PasswordResetPayload {
  sub: string;
  cid: string;
  purpose: 'password-reset';
}

/**
 * Equivalente a `UserSecurityService.verifyCredentials` +
 * `JWTService.generateToken` del sistema v1 (ver
 * ag2authmanager/src/services/user-security.service.ts y jwt.service.ts),
 * más cambio y recuperación de contraseña (no implementados en v1 — el
 * endpoint `changePassword` de v1 tenía un bug documentado, ver
 * `01-especificacion-motor-negocio-actual.md`).
 *
 * Diferencias deliberadas respecto a v1:
 * - Usa la credencial MÁS RECIENTE del usuario (order by TstCreation desc)
 *   en vez de la primera que encuentre — v1 no garantizaba cuál devolvía
 *   `findOne` tras un cambio de contraseña (que crea una fila nueva en
 *   vez de actualizar la existente). Aquí se mantiene ese historial
 *   deliberadamente (nunca se sobreescribe una credencial).
 * - JWT_SECRET es obligatorio, sin valor por defecto hardcodeado (v1 traía
 *   un secreto de fallback embebido en el código fuente).
 * - La recuperación de contraseña no usa una tabla nueva de tokens: el
 *   link es un JWT de un solo uso, de vida corta (`purpose: 'password-reset'`),
 *   que referencia el `IdeUserCredential` vigente al momento de emitirlo.
 *   Al usarse (o al cambiar la contraseña por cualquier otra vía) esa
 *   credencial deja de ser la más reciente, así que el mismo token no se
 *   puede reutilizar — sin necesidad de guardar/expirar tokens en la BD.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  async login(
    userName: string,
    password: string,
    extendedTokenDuration = false,
  ): Promise<LoginResult> {
    const invalidCredentials = 'Usuario o contraseña incorrectos';

    const user = await this.prisma.tUser.findFirst({
      where: { UserName: userName },
      include: { TRol: true },
    });
    if (!user) {
      throw new UnauthorizedException(invalidCredentials);
    }

    const credential = await this.latestCredential(user.IdeUser);
    if (!credential) {
      throw new UnauthorizedException(invalidCredentials);
    }

    const passwordMatches = await compare(password, credential.Credential);
    if (!passwordMatches) {
      throw new UnauthorizedException(invalidCredentials);
    }

    const userData = user.UserData as { lang?: string } | null;

    const payload: JwtPayload = {
      sub: user.IdeUser,
      code: user.CodUser,
      role: user.TRol.CodRol,
      lang: userData?.lang ?? 'es',
    };

    const expiresIn = extendedTokenDuration
      ? this.config.get<string>('JWT_EXTENDED_EXPIRES_IN', '90d')
      : this.config.get<string>('JWT_EXPIRES_IN', '8h');

    const token = await this.jwt.signAsync(payload, { expiresIn });

    return { token, codUser: user.CodUser, userData: user.UserData };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const credential = await this.latestCredential(userId);
    if (!credential) {
      throw new UnauthorizedException('No hay credenciales registradas para este usuario');
    }

    const matches = await compare(currentPassword, credential.Credential);
    if (!matches) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }

    await this.createCredential(userId, newPassword, credential.IdeState, 'self-service');
    return { ok: true };
  }

  /**
   * No revela si el usuario existe (evita enumeración) — siempre responde
   * igual desde el controller, exista o no el userName.
   */
  async requestPasswordReset(userName: string): Promise<void> {
    const user = await this.prisma.tUser.findFirst({ where: { UserName: userName } });
    if (!user) return;

    const credential = await this.latestCredential(user.IdeUser);
    if (!credential) return;

    const resetPayload: PasswordResetPayload = {
      sub: user.IdeUser,
      cid: credential.IdeUserCredential,
      purpose: 'password-reset',
    };
    const token = await this.jwt.signAsync(resetPayload, { expiresIn: '30m' });

    const baseUrl = this.config.get<string>(
      'PASSWORD_RESET_URL_BASE',
      'http://localhost:4200/reset-password',
    );
    const link = `${baseUrl}?token=${encodeURIComponent(token)}`;

    await this.emailSender.send({
      to: user.UserName,
      subject: 'Recupera tu contraseña — ARS Platform',
      html: `
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p><a href="${link}">Restablecer contraseña</a></p>
        <p>Este enlace vence en 30 minutos y solo se puede usar una vez. Si no fuiste tú, ignora este correo.</p>
      `,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
    const invalidToken = 'El enlace de recuperación es inválido, ya fue usado o expiró';

    let payload: PasswordResetPayload;
    try {
      payload = await this.jwt.verifyAsync<PasswordResetPayload>(token);
    } catch {
      throw new UnauthorizedException(invalidToken);
    }
    if (payload.purpose !== 'password-reset' || !payload.cid) {
      throw new UnauthorizedException(invalidToken);
    }

    const credential = await this.latestCredential(payload.sub);
    if (!credential || credential.IdeUserCredential !== payload.cid) {
      // La credencial "más reciente" ya no es la que tenía el token
      // cuando se emitió → o se usó una vez, o la contraseña cambió por
      // otra vía mientras tanto.
      throw new UnauthorizedException(invalidToken);
    }

    await this.createCredential(payload.sub, newPassword, credential.IdeState, 'password-reset');
    return { ok: true };
  }

  private latestCredential(userId: string): Promise<TUserCredential | null> {
    return this.prisma.tUserCredential.findFirst({
      where: { IdeUser: userId },
      orderBy: { TstCreation: 'desc' },
    });
  }

  private async createCredential(
    userId: string,
    plainPassword: string,
    stateId: string,
    actor: string,
  ): Promise<void> {
    const hashed = await hash(plainPassword, 10);
    const now = new Date();
    await this.prisma.tUserCredential.create({
      data: {
        IdeUser: userId,
        Credential: hashed,
        IdeState: stateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }
}
