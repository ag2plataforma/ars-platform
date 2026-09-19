import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { compare, hash } from 'bcryptjs';
import {
  buildOtpauthUrl,
  generateBackupCode,
  generateTotpSecret,
  verifyTotpCode,
} from './totp.util';

interface TwoFactorRow {
  IdeUserTwoFactor: string;
  IdeUser: string;
  Secret: string;
  IndEnabled: boolean;
}

interface BackupCodeRow {
  IdeUserBackupCode: string;
  CodeHash: string;
}

const BACKUP_CODE_COUNT = 10;
const SELF_SERVICE_ACTOR = 'self-service'; // mismo literal que AuthService.changePassword

/**
 * 2FA (TOTP) de `iam-service` -- feature nueva de cero, sin función
 * PL/pgSQL que replicar (v1 tampoco lo tenía, ver docs/02-roadmap.md).
 * Opcional, autoservicio: cualquier usuario lo activa/desactiva sobre su
 * propia cuenta, no cambia nada para quien no lo activa.
 *
 * Accede a `TUserTwoFactor`/`TUserBackupCode` con `$queryRaw`/`$executeRaw`
 * en vez del cliente Prisma tipado (como el resto del proyecto) porque
 * regenerar el cliente (`prisma generate`) necesita descargar el motor de
 * consultas desde internet, bloqueado por la política de red de este
 * entorno de trabajo ahora mismo -- mismo patrón ya usado para los
 * correlativos de cotización/contrato (`$queryRaw` con `nextval`, ver
 * `underwriting-service`). El SQL queda parametrizado (los `${...}`
 * interpolados en el template de Prisma se bindean como parámetros
 * reales, no concatenación de strings) -- mismo nivel de seguridad que
 * el cliente tipado.
 */
@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string): Promise<TwoFactorRow | null> {
    const rows = await this.prisma.$queryRaw<TwoFactorRow[]>`
      SELECT "IdeUserTwoFactor", "IdeUser", "Secret", "IndEnabled"
      FROM ars_platform."TUserTwoFactor"
      WHERE "IdeUser" = ${userId}::uuid
    `;
    return rows[0] ?? null;
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
    const existing = await this.findByUser(userId);
    if (existing) {
      await this.prisma.$executeRaw`
        UPDATE ars_platform."TUserTwoFactor"
        SET "Secret" = ${secret}, "IndEnabled" = false,
            "UsrModification" = ${SELF_SERVICE_ACTOR}, "TstModification" = ${now}
        WHERE "IdeUser" = ${userId}::uuid
      `;
    } else {
      await this.prisma.$executeRaw`
        INSERT INTO ars_platform."TUserTwoFactor"
          ("IdeUserTwoFactor", "IdeUser", "Secret", "IndEnabled",
           "UsrCreation", "TstCreation", "UsrModification", "TstModification")
        VALUES (gen_random_uuid(), ${userId}::uuid, ${secret}, false,
                ${SELF_SERVICE_ACTOR}, ${now}, ${SELF_SERVICE_ACTOR}, ${now})
      `;
    }
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
    const now = new Date();
    await this.prisma.$executeRaw`
      UPDATE ars_platform."TUserTwoFactor"
      SET "IndEnabled" = true, "UsrModification" = ${SELF_SERVICE_ACTOR}, "TstModification" = ${now}
      WHERE "IdeUser" = ${userId}::uuid
    `;
    return this.regenerateBackupCodes(userId);
  }

  /** Apaga 2FA para este usuario y borra sus códigos de respaldo. El controller ya validó contraseña + código antes de llamar acá. */
  async disable(userId: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM ars_platform."TUserTwoFactor" WHERE "IdeUser" = ${userId}::uuid
    `;
    await this.prisma.$executeRaw`
      DELETE FROM ars_platform."TUserBackupCode" WHERE "IdeUser" = ${userId}::uuid
    `;
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
    await this.prisma.$executeRaw`
      DELETE FROM ars_platform."TUserBackupCode" WHERE "IdeUser" = ${userId}::uuid
    `;
    const now = new Date();
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode());
    for (const code of codes) {
      const codeHash = await hash(code, 10);
      await this.prisma.$executeRaw`
        INSERT INTO ars_platform."TUserBackupCode"
          ("IdeUserBackupCode", "IdeUser", "CodeHash", "IndUsed",
           "UsrCreation", "TstCreation", "UsrModification", "TstModification")
        VALUES (gen_random_uuid(), ${userId}::uuid, ${codeHash}, false,
                ${SELF_SERVICE_ACTOR}, ${now}, ${SELF_SERVICE_ACTOR}, ${now})
      `;
    }
    return codes;
  }

  private async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<BackupCodeRow[]>`
      SELECT "IdeUserBackupCode", "CodeHash" FROM ars_platform."TUserBackupCode"
      WHERE "IdeUser" = ${userId}::uuid AND "IndUsed" = false
    `;
    for (const row of rows) {
      if (await compare(code, row.CodeHash)) {
        await this.prisma.$executeRaw`
          UPDATE ars_platform."TUserBackupCode"
          SET "IndUsed" = true, "TstModification" = ${new Date()}
          WHERE "IdeUserBackupCode" = ${row.IdeUserBackupCode}::uuid
        `;
        return true;
      }
    }
    return false;
  }
}
