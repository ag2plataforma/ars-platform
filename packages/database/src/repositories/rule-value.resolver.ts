import { Injectable } from '@nestjs/common';
import { RuleOrigin, RuleValueResolver } from '@ars-platform/shared-common';
import { PrismaService } from '../prisma.service';

/**
 * Implementación real de RuleValueResolver, equivalente a la función
 * PL/pgSQL `FGetValueRule` (ver
 * docs/01-especificacion-motor-negocio-actual.md, §1/§3.2): resuelve el
 * valor ya calculado (`ConceptValue`) de una regla anterior para la misma
 * cobertura (`TQuoteCoverageConcept`, origin=Quote) o el mismo movimiento
 * de cobertura (`TMovementConcept`, origin=Contract).
 *
 * `CodCalculationRule` es único (`SCalculationRule.CodCalculationRule`),
 * así que primero se resuelve su `IdeConcept` y luego se busca el
 * concepto ya calculado para esa cobertura/movimiento con ese
 * `IdeConcept` — más directo que el join del original y con el mismo
 * resultado. Igual que el original: sin dato, devuelve `0` en silencio.
 *
 * Nota: `RulesEngineService.evaluateChain` ya resuelve primero contra los
 * resultados calculados en la misma cadena (en memoria) antes de llegar
 * aquí — este resolver solo se consulta para referencias a reglas FUERA
 * de la cadena que se está evaluando (otra cobertura, o una corrida ya
 * persistida anteriormente).
 */
@Injectable()
export class PrismaRuleValueResolver implements RuleValueResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveRuleValue(
    origin: RuleOrigin,
    ideCoverageOrMovement: string,
    codCalculationRule: string,
  ): Promise<number> {
    const rule = await this.prisma.sCalculationRule.findUnique({
      where: { CodCalculationRule: codCalculationRule },
      select: { IdeConcept: true },
    });
    if (!rule) return 0;

    if (origin === 'Quote') {
      const concept = await this.prisma.tQuoteCoverageConcept.findFirst({
        where: { IdeQuoteCoverage: ideCoverageOrMovement, IdeConcept: rule.IdeConcept },
        select: { ConceptValue: true },
      });
      return concept ? Number(concept.ConceptValue) : 0;
    }

    const concept = await this.prisma.tMovementConcept.findFirst({
      where: { IdeCoverageMovement: ideCoverageOrMovement, IdeConcept: rule.IdeConcept },
      select: { ConceptValue: true },
    });
    return concept ? Number(concept.ConceptValue) : 0;
  }
}
