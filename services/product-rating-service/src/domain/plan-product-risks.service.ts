import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SPlanProductRisk } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreatePlanProductRiskDto } from './dto/create-plan-product-risk.dto';
import { UpdatePlanProductRiskDto } from './dto/update-plan-product-risk.dto';
import { ListPlanProductRisksDto } from './dto/list-plan-product-risks.dto';

const INCLUDE = {
  SPlanProduct: { include: { SProduct: true } },
  SRiskProduct: { include: { SRisk: true, SRiskType: true } },
  SState: true,
} as const;

/**
 * `SPlanProductRisk` — la tabla de unión entre `SPlanProduct` y
 * `SRiskProduct`: qué riesgos de producto cubre cada plan. Es una tabla
 * pura de configuración (sin `Cod`/`Des` propios), así que —igual que
 * `SRiskProduct`— se escribe explícita en vez de usar `CatalogCrudService`.
 * Es además la entrada obligatoria de `SCoveragePlan` (`IdePlanProductRisk`),
 * por eso `create`/`update` devuelven el registro completo con sus
 * relaciones resueltas: el consumidor necesita el `IdePlanProductRisk`
 * resultante para poder crear coberturas de plan.
 *
 * El esquema no tiene una restricción `@@unique` sobre
 * (`IdePlanProduct`, `IdeRiskProduct`), pero permitir dos filas idénticas
 * no tiene sentido de negocio — se valida a nivel de aplicación, igual
 * que `codUser`/`userName` en `UsersService` (que si tienen constraint,
 * pero el patrón de "validar antes de insertar" es el mismo).
 */
@Injectable()
export class PlanProductRisksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(query: ListPlanProductRisksDto): Promise<SPlanProductRisk[]> {
    const where: Prisma.SPlanProductRiskWhereInput = {};
    if (query.codPlanProduct) {
      where.SPlanProduct = { CodPlanProduct: query.codPlanProduct };
    }
    if (query.codRiskProduct) {
      where.SRiskProduct = { CodRiskProduct: query.codRiskProduct };
    }
    return this.prisma.sPlanProductRisk.findMany({ where, include: INCLUDE });
  }

  async findOne(id: string): Promise<SPlanProductRisk> {
    const row = await this.prisma.sPlanProductRisk.findUnique({
      where: { IdePlanProductRisk: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe relación plan-producto/riesgo con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreatePlanProductRiskDto, actor: string): Promise<SPlanProductRisk> {
    const idePlanProduct = await this.resolvePlanProduct(dto.codPlanProduct);
    const ideRiskProduct = await this.resolveRiskProduct(dto.codRiskProduct);

    const existing = await this.prisma.sPlanProductRisk.findFirst({
      where: { IdePlanProduct: idePlanProduct, IdeRiskProduct: ideRiskProduct },
    });
    if (existing) {
      throw new ConflictException(
        `El plan "${dto.codPlanProduct}" ya incluye el riesgo de producto "${dto.codRiskProduct}"`,
      );
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sPlanProductRisk.create({
      data: {
        IdePlanProduct: idePlanProduct,
        IdeRiskProduct: ideRiskProduct,
        TstInitial: new Date(dto.tstInitial),
        TstEnd: new Date(dto.tstEnd),
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdatePlanProductRiskDto, actor: string): Promise<SPlanProductRisk> {
    await this.findOne(id);

    const data: Prisma.SPlanProductRiskUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.tstInitial !== undefined) data.TstInitial = new Date(dto.tstInitial);
    if (dto.tstEnd !== undefined) data.TstEnd = new Date(dto.tstEnd);
    if (dto.codPlanProduct !== undefined) {
      data.IdePlanProduct = await this.resolvePlanProduct(dto.codPlanProduct);
    }
    if (dto.codRiskProduct !== undefined) {
      data.IdeRiskProduct = await this.resolveRiskProduct(dto.codRiskProduct);
    }

    return this.prisma.sPlanProductRisk.update({
      where: { IdePlanProductRisk: id },
      data,
      include: INCLUDE,
    });
  }

  async setState(id: string, codState: string, actor: string): Promise<SPlanProductRisk> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sPlanProductRisk.update({
      where: { IdePlanProductRisk: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolvePlanProduct(codPlanProduct: string): Promise<string> {
    const planProduct = await this.prisma.sPlanProduct.findFirst({
      where: { CodPlanProduct: codPlanProduct },
    });
    if (!planProduct) {
      throw new NotFoundException(`No existe plan de producto con código "${codPlanProduct}"`);
    }
    return planProduct.IdePlanProduct;
  }

  private async resolveRiskProduct(codRiskProduct: string): Promise<string> {
    const riskProduct = await this.prisma.sRiskProduct.findFirst({
      where: { CodRiskProduct: codRiskProduct },
    });
    if (!riskProduct) {
      throw new NotFoundException(`No existe riesgo de producto con código "${codRiskProduct}"`);
    }
    return riskProduct.IdeRiskProduct;
  }
}
