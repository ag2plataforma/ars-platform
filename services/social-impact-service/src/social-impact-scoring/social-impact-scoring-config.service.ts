import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SSocialImpactScoring } from '@ars-platform/database';
import { SocialImpactFormula } from './social-impact-formula.interface';

/**
 * `SSocialImpactScoring` -- fila única global con la fórmula real de
 * Impacto Social (Etapa 2, ver docs/02-roadmap.md). No usa
 * `CatalogCrudService` (no tiene `Cod`/`Des`, ni tiene sentido más de
 * una fila) ni máquina de estados (no hay "Activo"/"Inactivo" para una
 * configuración global única) -- se administra como un simple
 * get/replace, mismo espíritu que `SCalculationRule.FormulaJSON` pero a
 * nivel de sistema completo en vez de por regla.
 *
 * La fila inicial la crea `packages/database/scripts/
 * setup-social-impact-scoring-tables.js` -- si no existe todavía, se
 * informa con un error claro en vez de inventar un default acá (para no
 * tener el mismo default duplicado en JS y en TS, con riesgo real de
 * que diverjan).
 */
@Injectable()
export class SocialImpactScoringConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(): Promise<SSocialImpactScoring> {
    const row = await this.prisma.sSocialImpactScoring.findFirst({ orderBy: { TstModification: 'desc' } });
    if (!row) {
      throw new NotFoundException(
        'No existe configuración de Impacto Social todavía -- correr packages/database/scripts/setup-social-impact-scoring-tables.js',
      );
    }
    return row;
  }

  async getCurrentFormula(): Promise<SocialImpactFormula> {
    const row = await this.getCurrent();
    return row.FormulaJSON as unknown as SocialImpactFormula;
  }

  async updateFormula(formula: SocialImpactFormula, actor: string): Promise<SSocialImpactScoring> {
    const current = await this.getCurrent();
    return this.prisma.sSocialImpactScoring.update({
      where: { IdeSocialImpactScoring: current.IdeSocialImpactScoring },
      data: {
        FormulaJSON: formula as object,
        UsrModification: actor,
        TstModification: new Date(),
      },
    });
  }
}
