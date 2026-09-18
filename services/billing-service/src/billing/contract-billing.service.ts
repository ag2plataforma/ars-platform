import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, TContractBilling } from '@ars-platform/database';
import { ListContractBillingDto } from './dto/list-contract-billing.dto';

const INCLUDE = { SState: true } as const;

/**
 * Solo lectura sobre `TContractBilling` -- NO es un catálogo administrable:
 * se genera automáticamente por contrato (`setContractBilling` en
 * `underwriting-service`), dividiendo la vigencia del contrato
 * (`TContract.TstInitial`/`TstEnd`) en tantos períodos iguales como indique
 * `SPaymentFraction.NumFraction` de la fracción de pago elegida -- no hay
 * datos de configuración de admin involucrados. Este módulo solo expone
 * esos períodos ya generados para consulta. La operación real de marcar un
 * período como facturado (`FContractBilling('BILL', ...)` en el original)
 * queda deliberadamente afuera: no se re-confirmó contra el código fuente
 * real (ver `docs/02-roadmap.md`), así que no se expone ningún endpoint de
 * escritura todavía.
 */
@Injectable()
export class ContractBillingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListContractBillingDto): Promise<TContractBilling[]> {
    const where: Prisma.TContractBillingWhereInput = {};
    if (query.ideContract) where.IdeContract = query.ideContract;

    return this.prisma.tContractBilling.findMany({
      where,
      include: INCLUDE,
      orderBy: { NumPeriod: 'asc' },
    });
  }

  async findOne(id: string): Promise<TContractBilling> {
    const period = await this.prisma.tContractBilling.findUnique({
      where: { IdeContractBilling: id },
      include: INCLUDE,
    });
    if (!period) {
      throw new NotFoundException(`No existe período de facturación con id "${id}"`);
    }
    return period;
  }
}
