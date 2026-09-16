import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CalculationRule,
  CalculationRuleHierarchy,
  CalculationRuleRepository,
  FieldToken,
} from '@ars-platform/shared-common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/**
 * Implementación real de CalculationRuleRepository (contrato definido en
 * @ars-platform/shared-common) contra SCalculationRule/SFieldDictionary/
 * SAttribute, replicando exactamente la lógica de selección de reglas de
 * `FQuoteCoverageConcept` (ver docs/01-especificacion-motor-negocio-actual.md,
 * §3.1/§3.2):
 *
 *  - Jerarquía Producto > PlanProductRisk > CoveragePlan con NULL como
 *    comodín para los dos primeros. `IdeCoveragePlan` es NOT NULL en el
 *    esquema (a diferencia de los otros dos), así que ahí siempre es
 *    match exacto — el "or IdeCoveragePlan is null" del original es
 *    código defensivo que nunca se activa, se documenta pero no se copia.
 *  - Solo reglas en estado "Activo" (igual que sr."IdeState" = FGetState('STATE',...,'Activo')).
 *  - Ordenadas por `Order` (el orden de evaluación importa por `rule(...)`).
 */
@Injectable()
export class PrismaCalculationRuleRepository implements CalculationRuleRepository {
  private activeStateIdPromise: Promise<string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async findApplicableRules(hierarchy: CalculationRuleHierarchy): Promise<CalculationRule[]> {
    const activeStateId = await this.getActiveStateId();

    const productCondition: Prisma.SCalculationRuleWhereInput = hierarchy.ideProduct
      ? { OR: [{ IdeProduct: hierarchy.ideProduct }, { IdeProduct: null }] }
      : { IdeProduct: null };

    const planProductRiskCondition: Prisma.SCalculationRuleWhereInput = hierarchy.idePlanProductRisk
      ? { OR: [{ IdePlanProductRisk: hierarchy.idePlanProductRisk }, { IdePlanProductRisk: null }] }
      : { IdePlanProductRisk: null };

    const rows = await this.prisma.sCalculationRule.findMany({
      where: {
        IdeState: activeStateId,
        IdeCoveragePlan: hierarchy.ideCoveragePlan,
        AND: [productCondition, planProductRiskCondition],
      },
      orderBy: { Order: 'asc' },
    });

    return rows.map((row) => this.toCalculationRule(row));
  }

  async listActiveFieldTokens(): Promise<FieldToken[]> {
    const activeStateId = await this.getActiveStateId();
    const attributes = await this.prisma.sAttribute.findMany({
      where: {
        IdeState: activeStateId,
        SFieldDictionary: { IdeState: activeStateId },
      },
      select: {
        IdeAttribute: true,
        SFieldDictionary: { select: { CodFieldDictionary: true } },
      },
    });
    return attributes.map((attribute) => ({
      codFieldDictionary: attribute.SFieldDictionary.CodFieldDictionary,
      ideAttribute: attribute.IdeAttribute,
    }));
  }

  private toCalculationRule(row: {
    IdeCalculationRule: string;
    CodCalculationRule: string;
    Order: number;
    IdeConcept: string;
    DesColumnName: string | null;
    FormulaJSON: Prisma.JsonValue | null;
  }): CalculationRule {
    return {
      ideCalculationRule: row.IdeCalculationRule,
      codCalculationRule: row.CodCalculationRule,
      order: row.Order,
      ideConcept: row.IdeConcept,
      desColumnName: row.DesColumnName,
      formula: parseFormulaJson(row.FormulaJSON, row.CodCalculationRule),
    };
  }

  private async getActiveStateId(): Promise<string> {
    if (!this.activeStateIdPromise) {
      this.activeStateIdPromise = this.prisma.sState
        .findFirst({ where: { CodState: 'ACTIVO' }, select: { IdeState: true } })
        .then((state) => {
          if (!state) {
            throw new NotFoundException('No existe el estado "ACTIVO" en el catálogo SState');
          }
          return state.IdeState;
        });
    }
    return this.activeStateIdPromise;
  }
}

/**
 * `FormulaJSON` se guarda con las claves `IF`/`THEN`/`ELSE` (igual que
 * `"FormulaJSON"::json->>'IF'` en el original). Cualquier otra forma se
 * trata como configuración inválida — no hay fallback silencioso aquí
 * (a diferencia de FGetValueAttribute/FGetValueRule, que sí lo tienen).
 */
function parseFormulaJson(
  formulaJson: Prisma.JsonValue | null,
  codCalculationRule: string,
): CalculationRule['formula'] {
  if (!formulaJson || typeof formulaJson !== 'object' || Array.isArray(formulaJson)) {
    throw new Error(`La regla "${codCalculationRule}" no tiene FormulaJSON configurado correctamente`);
  }
  const obj = formulaJson as Record<string, unknown>;
  const ifValue = obj['IF'];
  const thenValue = obj['THEN'];
  const elseValue = obj['ELSE'];
  if (typeof ifValue !== 'string' || typeof thenValue !== 'string' || typeof elseValue !== 'string') {
    throw new Error(
      `La regla "${codCalculationRule}" tiene un FormulaJSON inválido (se esperan las claves IF/THEN/ELSE como texto)`,
    );
  }
  return { if: ifValue, then: thenValue, else: elseValue };
}
