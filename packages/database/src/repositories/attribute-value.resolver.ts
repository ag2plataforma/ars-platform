import { Injectable } from '@nestjs/common';
import { AttributeValueResolver, RuleOrigin } from '@ars-platform/shared-common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/**
 * Implementación real de AttributeValueResolver, equivalente a la función
 * PL/pgSQL `FGetValueAttribute` (ver
 * docs/01-especificacion-motor-negocio-actual.md, §1/§3.2):
 *
 *  1. Busca el `SAttributeProperty` del atributo (`IdeAttribute`).
 *  2. Con su `IdeAttributeProperty`, busca en el JSON `RiskAttributeValue`
 *     del riesgo (`TQuoteRisk` si origin=Quote, `TFileRisk` si
 *     origin=Contract) el valor guardado bajo esa clave — es el
 *     `IdeFieldValue` (uuid) elegido para ese riesgo.
 *  3. Resuelve el `CodFieldValue` (texto) de `SFieldValue` con ese id.
 *
 * Igual que el original: cualquier paso sin dato devuelve `'0'` en
 * silencio ("atributo no configurado = no aporta al cálculo" — regla de
 * negocio implícita mencionada en la especificación, no un bug a corregir).
 *
 * Nota: si `SAttributeProperty` tuviera más de una fila para el mismo
 * `IdeAttribute` (un atributo asociado a más de un `SModelAttribute`), el
 * original fallaría en tiempo de ejecución (`too_many_rows`, sin capturar);
 * aquí simplemente se toma la primera — mismo comportamiento frágil,
 * documentado, no una regla de negocio a preservar.
 *
 * `dbTransaction` (opcional, opaco en la interfaz de `shared-common`): si
 * viene informado se castea a `Prisma.TransactionClient` y se usa esa
 * conexión en vez de `this.prisma` -- necesario cuando `ideOriginRisk`
 * (para origin=Contract, un `TFileRisk`) fue creado por la MISMA
 * transacción activa y todavía no hizo commit (ver
 * `ContractsService.copyRisksAndCoverages`/`createInitialMovements` y
 * docs/02-roadmap.md): sin esto, `this.prisma` -- una conexión aparte --
 * no ve esa fila bajo READ COMMITTED y el método cae en el fallback `'0'`
 * como si el dato no existiera.
 */
@Injectable()
export class PrismaAttributeValueResolver implements AttributeValueResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAttributeValue(
    origin: RuleOrigin,
    ideOriginRisk: string,
    ideAttribute: string,
    dbTransaction?: unknown,
  ): Promise<string> {
    const db = (dbTransaction as Prisma.TransactionClient | undefined) ?? this.prisma;

    const property = await db.sAttributeProperty.findFirst({
      where: { IdeAttribute: ideAttribute },
      select: { IdeAttributeProperty: true },
    });
    if (!property) {
      return '0';
    }

    const riskAttributeValue = await this.getRiskAttributeValue(origin, ideOriginRisk, db);
    const ideFieldValue = extractJsonStringValue(riskAttributeValue, property.IdeAttributeProperty);
    if (!ideFieldValue) {
      return '0';
    }

    const fieldValue = await db.sFieldValue.findFirst({
      where: { IdeFieldValue: ideFieldValue },
      select: { CodFieldValue: true },
    });
    return fieldValue?.CodFieldValue ?? '0';
  }

  private async getRiskAttributeValue(
    origin: RuleOrigin,
    ideOriginRisk: string,
    db: Prisma.TransactionClient,
  ): Promise<Prisma.JsonValue | null> {
    if (origin === 'Quote') {
      const risk = await db.tQuoteRisk.findUnique({
        where: { IdeQuoteRisk: ideOriginRisk },
        select: { RiskAttributeValue: true },
      });
      return risk?.RiskAttributeValue ?? null;
    }
    const risk = await db.tFileRisk.findUnique({
      where: { IdeFileRisk: ideOriginRisk },
      select: { RiskAttributeValue: true },
    });
    return risk?.RiskAttributeValue ?? null;
  }
}

function extractJsonStringValue(json: Prisma.JsonValue | null, key: string): string | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}
