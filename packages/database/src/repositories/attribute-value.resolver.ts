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
 */
@Injectable()
export class PrismaAttributeValueResolver implements AttributeValueResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAttributeValue(
    origin: RuleOrigin,
    ideOriginRisk: string,
    ideAttribute: string,
  ): Promise<string> {
    const property = await this.prisma.sAttributeProperty.findFirst({
      where: { IdeAttribute: ideAttribute },
      select: { IdeAttributeProperty: true },
    });
    if (!property) return '0';

    const riskAttributeValue = await this.getRiskAttributeValue(origin, ideOriginRisk);
    const ideFieldValue = extractJsonStringValue(riskAttributeValue, property.IdeAttributeProperty);
    if (!ideFieldValue) return '0';

    const fieldValue = await this.prisma.sFieldValue.findFirst({
      where: { IdeFieldValue: ideFieldValue },
      select: { CodFieldValue: true },
    });
    return fieldValue?.CodFieldValue ?? '0';
  }

  private async getRiskAttributeValue(
    origin: RuleOrigin,
    ideOriginRisk: string,
  ): Promise<Prisma.JsonValue | null> {
    if (origin === 'Quote') {
      const risk = await this.prisma.tQuoteRisk.findUnique({
        where: { IdeQuoteRisk: ideOriginRisk },
        select: { RiskAttributeValue: true },
      });
      return risk?.RiskAttributeValue ?? null;
    }
    const risk = await this.prisma.tFileRisk.findUnique({
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
