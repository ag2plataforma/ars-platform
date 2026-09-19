import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService, TUserBackupCode, TUserTwoFactor } from '@ars-platform/database';
import { compare, hash } from 'bcryptjs';
import {
  buildOtpauthUrl,
  generateBackupCode,
  generateTotpSecret,
  verifyTotpCode,
} from './totp.util';

const BACKUP_CODE_COUNT = 10;
const SELF_SERVICE_ACTOR = 'self-service'; // mismo literal que AuthService.changePassword

/**
 * 2FA (TOTP) de `iam-service` -- feature nueva de cero, sin función
 * PL/pgSQL que replicar (v1 tampoco lo tenía, ver docs/02-roadmap.md).
 * Opcional, autoservicio: cualquier usuario lo activa/desactiva sobre su
 * propia cuenta, no cambia nada para quien no lo activa.
 *
 * Usa el cliente Prisma tipado (`this.prisma.tUserTwoFactor` /
 * `tUserBackupCode`), igual que el resto del proyecto. Nota histórica:
 * durante el desarrollo inicial esto se implementó con `$queryRaw` /
 * `$executeRaw` porque el entorno de trabajo de ese momento no podía
 * regenerar el cliente Prisma (descarga del motor de consultas bloqueada
 * por política de red); una vez el usuario corrió `prisma generate` en su
 * propia máquina se refactorizó al cliente tipado.
 */
@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string): Promise<TUserTwoFactor | null> {
    return this.prisma.tUserTwoFactor.findUnique({ where: { IdeUser: userId } });
  }

  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.findByUser(userId);
    return row?.IndEnabled ?? false;
  }

  /**
   * Genera un secreto nuevo y lo deja "pendiente" (`IndEnabled = false`)
   * hasta que `confirmEnrollment` reciba un código válido -- evita que un
   * usuario quede bloqueado si escaneó mal el QR y nunca confirma.
   */
  async startEnrollment(
    userId: string,
    accountName: string,
  ): Promise<{ secret: string; otpauthUrl: string }> {
    const secret = generateTotpSecret();
    const now = new Date();
    await this.prisma.tUserTwoFactor.upsert({
      where: { IdeUser: userId },
      update: {
        Secret: secret,
        IndEnabled: false,
        UsrModification: SELF_SERVICE_ACTOR,
        TstModification: now,
      },
      create: {
        IdeUser: userId,
        Secret: secret,
        IndEnabled: false,
        UsrCreation: SELF_SERVICE_ACTOR,
        TstCreation: now,
        UsrModification: SELF_SERVICE_ACTOR,
        TstModification: now,
      },
    });
    return { secret, otpauthUrl: buildOtpauthUrl(secret, accountName) };
  }

  /**
   * Confirma el enrolamiento con un código real generado por la app
   * autenticadora. Al confirmar, (re)genera los 10 códigos de respaldo --
   * se devuelven en texto plano UNA sola vez acá, después solo existe su
   * hash.
   */
  async confirmEnrollment(userId: string, code: string): Promise<string[]> {
    const row = await this.findByUser(userId);
    if (!row) {
      throw new NotFoundException('No hay un enrolamiento de 2FA en curso para este usuario');
    }
    if (!verifyTotpCode(row.Secret, code)) {
      throw new UnauthorizedException('Código de verificación incorrecto');
    }
    await this.prisma.tUserTwoFactor.update({
      where: { IdeUser: userId },
      data: {
        IndEnabled: true,
        UsrModification: SELF_SERVICE_ACTOR,
        TstModification: new Date(),
      },
    });
    return this.regenerateBackupCodes(userId);
  }

  /** Apaga 2FA para este usuario y borra sus códigos de respaldo. El controller ya validó contraseña + código antes de llamar acá. */
  async disable(userId: string): Promise<void> {
    await this.prisma.tUserTwoFactor.deleteMany({ where: { IdeUser: userId } });
    await this.prisma.tUserBackupCode.deleteMany({ where: { IdeUser: userId } });
  }

  /** Código TOTP válido, o código de respaldo sin usar (lo consume si matchea). */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const row = await this.findByUser(userId);
    if (!row || !row.IndEnabled) return false;
    const normalized = code.trim();
    if (verifyTotpCode(row.Secret, normalized)) {
      return true;
    }
    return this.consumeBackupCode(userId, normalized);
  }

  private async regenerateBackupCodes(userId: string): Promise<string[]> {
    await this.prisma.tUserBackupCode.deleteMany({ where: { IdeUser: userId } });
    const now = new Date();
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode());
    const hashes = await Promise.all(codes.map((code) => hash(code, 10)));
    await this.prisma.tUserBackupCode.createMany({
      data: hashes.map((codeHash) => ({
        IdeUser: userId,
        CodeHash: codeHash,
        IndUsed: false,
        UsrCreation: SELF_SERVICE_ACTOR,
        TstCreation: now,
        UsrModification: SELF_SERVICE_ACTOR,
        TstModification: now,
      })),
    });
    return codes;
  }

  private async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    const rows: Pick<TUserBackupCode, 'IdeUserBackupCode' | 'CodeHash'>[] =
      await this.prisma.tUserBackupCode.findMany({
        where: { IdeUser: userId, IndUsed: false },
        select: { IdeUserBackupCode: true, CodeHash: true },
      });
    for (const row of rows) {
      if (await compare(code, row.CodeHash)) {
        await this.prisma.tUserBackupCode.update({
          where: { IdeUserBackupCode: row.IdeUserBackupCode },
          data: { IndUsed: true, TstModification: new Date() },
        });
        return true;
      }
    }
    return false;
  }
}
