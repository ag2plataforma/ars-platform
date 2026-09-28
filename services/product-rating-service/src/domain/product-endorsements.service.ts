import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SProductEndorsement } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateProductEndorsementDto } from './dto/create-product-endorsement.dto';
import { UpdateProductEndorsementDto } from './dto/update-product-endorsement.dto';
import { ListProductEndorsementsDto } from './dto/list-product-endorsements.dto';

const INCLUDE = {
  SProduct: true,
  SEndorsement: true,
  SEndorsementReason: true,
  SState: true,
} as const;

const DEFAULT_OPERATION_PRODUCT_ORDER = 1;

/**
 * `SProductEndorsement` -- bespoke en vez de `CatalogCrudService` pese a
 * tener `Cod`/`Des` propio (a diferencia de `SCalculationRule`), porque
 * `create()` tiene que dar de alta ADEMÁS, en la misma transacción, la
 * fila `SOperationProduct` que le falta (ver
 * `ContractsService.resolveOperationCodeByEndorsement` en
 * `underwriting-service`: busca `SOperationProduct` por
 * `IdeProductEndorsement`, no por `IdeProduct` como `CONTGENE`/`RECEGENE` --
 * sin esa fila, el endoso quedaría configurado pero fallaría recién al
 * anular un contrato con él). Agregada 2026-09-28 (backlog priorizado,
 * ítem 1, Etapa 1 -- cierre de Anulación): el motor de cálculo/prorrateo
 * (`ContractsService.cancel()`/`setCancelPrime`, que lee
 * `ConditionData.refundPremium/refundCommission/refundTax`) ya existía y
 * estaba probado, pero no había ninguna pantalla para dar de alta un
 * `SProductEndorsement` real -- solo una fila de prueba sembrada por
 * script.
 */
@Injectable()
export class ProductEndorsementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(query: ListProductEndorsementsDto): Promise<SProductEndorsement[]> {
    const where: Prisma.SProductEndorsementWhereInput = {};
    if (query.codProduct) {
      where.SProduct = { CodProduct: query.codProduct };
    }
    return this.prisma.sProductEndorsement.findMany({
      where,
      orderBy: { DesProductEndorsement: 'asc' },
      include: INCLUDE,
    });
  }

  async findOne(id: string): Promise<SProductEndorsement> {
    const row = await this.prisma.sProductEndorsement.findUnique({
      where: { IdeProductEndorsement: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe endoso de producto con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateProductEndorsementDto, actor: string): Promise<SProductEndorsement> {
    const existing = await this.prisma.sProductEndorsement.findFirst({
      where: { CodProductEndorsement: dto.codProductEndorsement },
    });
    if (existing) {
      throw new ConflictException(`Ya existe endoso de producto con código "${dto.codProductEndorsement}"`);
    }

    const [product, endorsement, endorsementReason, operation, process_] = await Promise.all([
      this.resolveByCode(this.prisma.sProduct, 'CodProduct', dto.codProduct, 'producto'),
      this.resolveByCode(this.prisma.sEndorsement, 'CodEndorsement', dto.codEndorsement, 'tipo de endoso'),
      this.resolveByCode(
        this.prisma.sEndorsementReason,
        'CodEndorsementReason',
        dto.codEndorsementReason,
        'motivo de endoso',
      ),
      this.resolveByCode(this.prisma.sOperation, 'CodOperation', dto.codOperation, 'operación'),
      this.resolveByCode(this.prisma.sProcess, 'CodProcess', dto.codProcess, 'proceso'),
    ]);

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.sProductEndorsement.create({
        data: {
          CodProductEndorsement: dto.codProductEndorsement,
          DesProductEndorsement: dto.desProductEndorsement,
          IdeProduct: product.IdeProduct,
          IdeEndorsement: endorsement.IdeEndorsement,
          IdeEndorsementReason: endorsementReason.IdeEndorsementReason,
          ConditionData: (dto.conditionData ?? {}) as Prisma.InputJsonValue,
          IdeState: activeStateId,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
        include: INCLUDE,
      });

      await tx.sOperationProduct.create({
        data: {
          IdeProduct: product.IdeProduct,
          IdeOperation: operation.IdeOperation,
          IdeProcess: process_.IdeProcess,
          IdeProductEndorsement: created.IdeProductEndorsement,
          Order: DEFAULT_OPERATION_PRODUCT_ORDER,
          IdeState: activeStateId,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });

      return created;
    });
  }

  async update(id: string, dto: UpdateProductEndorsementDto, actor: string): Promise<SProductEndorsement> {
    await this.findOne(id);
    return this.prisma.sProductEndorsement.update({
      where: { IdeProductEndorsement: id },
      data: {
        ...(dto.desProductEndorsement !== undefined ? { DesProductEndorsement: dto.desProductEndorsement } : {}),
        ...(dto.conditionData !== undefined
          ? { ConditionData: dto.conditionData as Prisma.InputJsonValue }
          : {}),
        UsrModification: actor,
        TstModification: new Date(),
      },
      include: INCLUDE,
    });
  }

  async setState(id: string, codState: string, actor: string): Promise<SProductEndorsement> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sProductEndorsement.update({
      where: { IdeProductEndorsement: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveByCode<T extends Record<string, unknown>>(
    delegate: { findFirst(args: { where: Record<string, unknown> }): Promise<T | null> },
    codField: string,
    code: string,
    label: string,
  ): Promise<T> {
    const row = await delegate.findFirst({ where: { [codField]: code } });
    if (!row) {
      throw new NotFoundException(`No existe ${label} con código "${code}"`);
    }
    return row;
  }
}
