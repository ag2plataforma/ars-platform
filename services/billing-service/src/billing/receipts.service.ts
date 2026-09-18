import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, TReceipt } from '@ars-platform/database';
import { ListReceiptsDto } from './dto/list-receipts.dto';

const LIST_INCLUDE = {
  SReceiptType: true,
  SState: true,
} as const;

const DETAIL_INCLUDE = {
  SReceiptType: true,
  SState: true,
  TReceiptDetail: {
    include: {
      SConcept: true,
      SInsuranceLine: true,
      SState: true,
    },
    orderBy: { TstCreation: 'asc' as const },
  },
} as const;

/**
 * Solo lectura sobre `TReceipt`/`TReceiptDetail` -- la GENERACIÓN real de
 * recibos (equivalente a `FReceipt('NEWCONTRACT'|'CANCELCONTRACT', ...)`)
 * ya vive en `underwriting-service` (`ContractsService.generateReceipts`),
 * como parte de la cascada de creación/cancelación de contrato (la de
 * cancelación además corre dentro de un `$transaction` real) -- no se
 * duplica ni se migra acá (decisión explícita del usuario, ver
 * `docs/02-roadmap.md`). Este módulo solo expone para CONSULTA lo que ese
 * servicio ya escribe, contra el mismo Postgres compartido (misma
 * decisión ya tomada de esquema único para todos los servicios).
 */
@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListReceiptsDto): Promise<TReceipt[]> {
    const where: Prisma.TReceiptWhereInput = {};
    if (query.ideContract) where.IdeContract = query.ideContract;
    if (query.ideContractFile) where.IdeContractFile = query.ideContractFile;

    return this.prisma.tReceipt.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: { TstIssue: 'desc' },
    });
  }

  async findOne(id: string) {
    const receipt = await this.prisma.tReceipt.findUnique({
      where: { IdeReceipt: id },
      include: DETAIL_INCLUDE,
    });
    if (!receipt) {
      throw new NotFoundException(`No existe recibo con id "${id}"`);
    }
    return receipt;
  }
}
