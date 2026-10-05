import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SOperationProduct } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateProductOperationDto } from './dto/create-product-operation.dto';
import { ListProductOperationsDto } from './dto/list-product-operations.dto';

const INCLUDE = { SProduct: true, SOperation: true, SProcess: true, SProductEndorsement: true, SState: true } as const;

/** Operaciones base que necesita cualquier producto para contratarse/renovarse: operación -> proceso. */
const BASE_OPERATIONS: { codOperation: string; codProcess: string }[] = [
  { codOperation: 'CONTGENE', codProcess: 'CONTRATACION' },
  { codOperation: 'RECEGENE', codProcess: 'CONTRATACION' },
  { codOperation: 'RENOVGENE', codProcess: 'RENOVACION' },
];

export interface SetupBaseResult {
  created: string[];
  existing: string[];
  /** Operaciones que no se pudieron crear (falta la operación o el proceso en el catálogo). */
  skipped: { codOperation: string; reason: string }[];
}

/**
 * `SOperationProduct` -- qué operaciones (generación de contrato, de recibo, de renovación,
 * y las de cada endoso) tiene habilitadas un producto y bajo qué proceso. `underwriting-service`
 * las busca por código al contratar (`CONTGENE`, `RECEGENE`), renovar (`RENOVGENE`) y en cada
 * suplemento; sin la fila el contrato falla con "no tiene configurada la operación".
 * Las filas de endosos las crea `ProductEndorsementsService`; acá se gestionan las base.
 */
@Injectable()
export class ProductOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async findAll(query: ListProductOperationsDto): Promise<SOperationProduct[]> {
    const where: Prisma.SOperationProductWhereInput = {};
    if (query.codProduct) where.SProduct = { CodProduct: query.codProduct };
    return this.prisma.sOperationProduct.findMany({ where, include: INCLUDE, orderBy: { Order: 'asc' } });
  }

  async create(dto: CreateProductOperationDto, actor: string): Promise<SOperationProduct> {
    const [product, operation, process_] = await Promise.all([
      this.prisma.sProduct.findFirst({ where: { CodProduct: dto.codProduct } }),
      this.prisma.sOperation.findFirst({ where: { CodOperation: dto.codOperation } }),
      this.prisma.sProcess.findFirst({ where: { CodProcess: dto.codProcess } }),
    ]);
    if (!product) throw new NotFoundException(`No existe producto con código "${dto.codProduct}"`);
    if (!operation) throw new NotFoundException(`No existe operación con código "${dto.codOperation}"`);
    if (!process_) throw new NotFoundException(`No existe proceso con código "${dto.codProcess}"`);

    const existing = await this.prisma.sOperationProduct.findFirst({
      where: {
        IdeProduct: product.IdeProduct,
        IdeOperation: operation.IdeOperation,
        IdeProcess: process_.IdeProcess,
        IdeProductEndorsement: null,
      },
    });
    if (existing) {
      throw new ConflictException(
        `El producto "${dto.codProduct}" ya tiene la operación "${dto.codOperation}" bajo el proceso "${dto.codProcess}"`,
      );
    }
    return this.createRow(product.IdeProduct, operation.IdeOperation, process_.IdeProcess, actor);
  }

  /** Crea las operaciones base que le falten al producto (idempotente). */
  async setupBase(codProduct: string, actor: string): Promise<SetupBaseResult> {
    const product = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct } });
    if (!product) throw new NotFoundException(`No existe producto con código "${codProduct}"`);

    const result: SetupBaseResult = { created: [], existing: [], skipped: [] };
    for (const base of BASE_OPERATIONS) {
      const [operation, process_] = await Promise.all([
        this.prisma.sOperation.findFirst({ where: { CodOperation: base.codOperation } }),
        this.prisma.sProcess.findFirst({ where: { CodProcess: base.codProcess } }),
      ]);
      if (!operation) {
        result.skipped.push({ codOperation: base.codOperation, reason: `no existe la operación "${base.codOperation}" en el catálogo` });
        continue;
      }
      if (!process_) {
        result.skipped.push({ codOperation: base.codOperation, reason: `no existe el proceso "${base.codProcess}" en el catálogo` });
        continue;
      }
      const existing = await this.prisma.sOperationProduct.findFirst({
        where: { IdeProduct: product.IdeProduct, IdeOperation: operation.IdeOperation, IdeProductEndorsement: null },
      });
      if (existing) {
        result.existing.push(base.codOperation);
        continue;
      }
      await this.createRow(product.IdeProduct, operation.IdeOperation, process_.IdeProcess, actor);
      result.created.push(base.codOperation);
    }
    return result;
  }

  async setState(id: string, codState: string, actor: string): Promise<SOperationProduct> {
    const row = await this.prisma.sOperationProduct.findUnique({ where: { IdeOperationProduct: id } });
    if (!row) throw new NotFoundException(`No existe operación de producto con id "${id}"`);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sOperationProduct.update({
      where: { IdeOperationProduct: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async createRow(
    ideProduct: string,
    ideOperation: string,
    ideProcess: string,
    actor: string,
  ): Promise<SOperationProduct> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const last = await this.prisma.sOperationProduct.findFirst({
      where: { IdeProduct: ideProduct },
      orderBy: { Order: 'desc' },
      select: { Order: true },
    });
    const now = new Date();
    return this.prisma.sOperationProduct.create({
      data: {
        IdeProduct: ideProduct,
        IdeOperation: ideOperation,
        IdeProcess: ideProcess,
        Order: (last ? Number(last.Order) : 0) + 1,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }
}
