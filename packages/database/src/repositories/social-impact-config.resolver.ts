import { Injectable } from '@nestjs/common';
import { SocialImpactConfig, SocialImpactConfigResolver } from '@ars-platform/shared-common';
import { PrismaService } from '../prisma.service';

/**
 * Implementación real de `SocialImpactConfigResolver` (Fase 3, ver
 * docs/02-roadmap.md) -- lee `SSocialImpactConfig` directamente vía
 * Prisma. La consume `underwriting-service` EN PROCESO, dentro de
 * `SocialImpactCalculatorService` (`@ars-platform/shared-common`) --
 * decisión explícita del usuario (2026-09-22) de no hacer todavía una
 * llamada HTTP real a `social-impact-service` (ver el pendiente
 * documentado en el roadmap).
 *
 * "Activo" se resuelve contra `SState.CodState` (misma convención que
 * `getStateByCode('ACTIVO')` usa en el resto del sistema), no contra un
 * booleano propio -- esta tabla no es distinta al resto de las tablas de
 * configuración del sistema en ese sentido.
 */
@Injectable()
export class PrismaSocialImpactConfigResolver implements SocialImpactConfigResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActiveConfig(ideProduct: string): Promise<SocialImpactConfig | null> {
    const row = await this.prisma.sSocialImpactConfig.findFirst({
      where: { IdeProduct: ideProduct, SState: { CodState: 'ACTIVO' } },
    });
    if (!row) {
      return null;
    }
    return {
      ideSocialImpactConfig: row.IdeSocialImpactConfig,
      ideProduct: row.IdeProduct,
      configJSON: row.ConfigJSON as Record<string, unknown>,
    };
  }
}
