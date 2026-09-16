import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RateValueResolver } from '@ars-platform/shared-common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/**
 * Implementación real de `RateValueResolver`, equivalente exacto a la
 * función legacy `FGetRateValue` (confirmado contra su código fuente en
 * Postgres — esquemas `ag2ars`/`entity`/`temporal`, las tres copias
 * idénticas; ver `services/product-rating-service/README.md` para el
 * detalle completo de la semántica). La invoca `RulesEngineService`
 * cuando una fórmula de `SCalculationRule` contiene una llamada
 * `FGetRateValue(...)` (ver `substituteRateValueReferences` en
 * `@ars-platform/shared-common`), y también la reutiliza directamente
 * `product-rating-service` para su endpoint de prueba
 * `GET /rate-values/lookup` — una sola implementación para ambos usos.
 */
@Injectable()
export class PrismaRateValueResolver implements RateValueResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveRateValue(
    codRateTable: string,
    factor1: string,
    factor2?: string,
    factor3?: string,
    factor4?: string,
    factor5?: string,
  ): Promise<number> {
    const rateTable = await this.prisma.sRateTable.findFirst({
      where: { CodRateTable: codRateTable },
    });
    if (!rateTable) {
      throw new NotFoundException(`No existe tabla de tarifa con código "${codRateTable}"`);
    }

    const where: Prisma.SRateValueWhereInput = {
      IdeRateTable: rateTable.IdeRateTable,
      Factor1: factor1,
    };
    if (factor2 !== undefined) where.Factor2 = factor2;
    if (factor3 !== undefined) where.Factor3 = factor3;
    if (factor4 !== undefined) where.Factor4 = factor4;
    if (factor5 !== undefined) where.Factor5 = factor5;

    const rows = await this.prisma.sRateValue.findMany({ where });

    if (rows.length === 0) {
      throw new NotFoundException(
        'No se encontró valor de tarifa para los factores consultados.',
      );
    }
    if (rows.length > 1) {
      throw new ConflictException(
        'Se encontró más de un valor de tarifa para los factores consultados.',
      );
    }

    const raw = rows[0].Value;
    const value = raw === null || raw === '' ? NaN : Number(raw);
    if (Number.isNaN(value)) {
      throw new NotFoundException(
        'El valor de tarifa encontrado no es numérico o está vacío.',
      );
    }
    return value;
  }
}
