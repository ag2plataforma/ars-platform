import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SClaimApprovalThreshold } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateClaimApprovalThresholdDto } from './dto/create-claim-approval-threshold.dto';
import { UpdateClaimApprovalThresholdDto } from './dto/update-claim-approval-threshold.dto';

const INCLUDE = {
  SProduct: true,
  SPlanProduct: true,
  SCoveragePlan: { include: { SCoverage: true } },
  SCurrency: true,
  TRol: true,
  SState: true,
} as const;

/**
 * Ver el doc-comment de `CreateClaimApprovalThresholdDto` para el
 * análisis del modelo. Mismo patrón bespoke (sin `CatalogCrudService`,
 * resolución de FKs por código) que `ProductRequirementService`.
 */
@Injectable()
export class ClaimApprovalThresholdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(codProduct?: string, codCurrency?: string): Promise<SClaimApprovalThreshold[]> {
    const where: Prisma.SClaimApprovalThresholdWhereInput = {};
    if (codProduct) where.SProduct = { CodProduct: codProduct };
    if (codCurrency) where.SCurrency = { CodCurrency: codCurrency };
    return this.prisma.sClaimApprovalThreshold.findMany({ where, include: INCLUDE, orderBy: { Level: 'asc' } });
  }

  async findOne(id: string): Promise<SClaimApprovalThreshold> {
    const row = await this.prisma.sClaimApprovalThreshold.findUnique({
      where: { IdeClaimApprovalThreshold: id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException(`No existe umbral de aprobación con id "${id}"`);
    return row;
  }

  async create(dto: CreateClaimApprovalThresholdDto, actor: string): Promise<SClaimApprovalThreshold> {
    const [ideProduct, idePlanProduct, ideCoveragePlan, ideCurrency, ideRol] = await Promise.all([
      this.resolveProduct(dto.codProduct),
      dto.codPlanProduct ? this.resolvePlanProduct(dto.codPlanProduct) : Promise.resolve(null),
      dto.ideCoveragePlan ? this.assertCoveragePlan(dto.ideCoveragePlan) : Promise.resolve(null),
      this.resolveCurrency(dto.codCurrency),
      this.resolveRol(dto.codRol),
    ]);

    const existing = await this.prisma.sClaimApprovalThreshold.findFirst({
      where: {
        IdeProduct: ideProduct,
        IdePlanProduct: idePlanProduct,
        IdeCoveragePlan: ideCoveragePlan,
        IdeCurrency: ideCurrency,
        Level: dto.level,
      },
    });
    if (existing) {
      throw new NotFoundException(
        'Ya existe un umbral configurado para ese alcance (producto/plan/cobertura + moneda) y ese nivel',
      );
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sClaimApprovalThreshold.create({
      data: {
        IdeProduct: ideProduct,
        IdePlanProduct: idePlanProduct,
        IdeCoveragePlan: ideCoveragePlan,
        IdeCurrency: ideCurrency,
        Level: dto.level,
        MaxAmount: dto.maxAmount ?? null,
        IdeRol: ideRol,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateClaimApprovalThresholdDto, actor: string): Promise<SClaimApprovalThreshold> {
    await this.findOne(id);
    const data: Record<string, unknown> = { UsrModification: actor, TstModification: new Date() };
    if (dto.codProduct !== undefined) data.IdeProduct = await this.resolveProduct(dto.codProduct);
    if (dto.codPlanProduct !== undefined) {
      data.IdePlanProduct = dto.codPlanProduct ? await this.resolvePlanProduct(dto.codPlanProduct) : null;
    }
    if (dto.ideCoveragePlan !== undefined) {
      data.IdeCoveragePlan = dto.ideCoveragePlan ? await this.assertCoveragePlan(dto.ideCoveragePlan) : null;
    }
    if (dto.codCurrency !== undefined) data.IdeCurrency = await this.resolveCurrency(dto.codCurrency);
    if (dto.level !== undefined) data.Level = dto.level;
    if (dto.maxAmount !== undefined) data.MaxAmount = dto.maxAmount;
    if (dto.codRol !== undefined) data.IdeRol = await this.resolveRol(dto.codRol);

    return this.prisma.sClaimApprovalThreshold.update({
      where: { IdeClaimApprovalThreshold: id },
      data,
      include: INCLUDE,
    });
  }

  async setState(id: string, codState: string, actor: string): Promise<SClaimApprovalThreshold> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sClaimApprovalThreshold.update({
      where: { IdeClaimApprovalThreshold: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveProduct(codProduct: string): Promise<string> {
    const row = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct } });
    if (!row) throw new NotFoundException(`No existe producto con código "${codProduct}"`);
    return row.IdeProduct;
  }

  private async resolvePlanProduct(codPlanProduct: string): Promise<string> {
    const row = await this.prisma.sPlanProduct.findFirst({ where: { CodPlanProduct: codPlanProduct } });
    if (!row) throw new NotFoundException(`No existe plan de producto con código "${codPlanProduct}"`);
    return row.IdePlanProduct;
  }

  /** Sin código propio -- solo valida que exista, mismo criterio que `ProductRequirementService.assertCoveragePlan`. */
  private async assertCoveragePlan(ideCoveragePlan: string): Promise<string> {
    const row = await this.prisma.sCoveragePlan.findUnique({ where: { IdeCoveragePlan: ideCoveragePlan } });
    if (!row) throw new NotFoundException(`No existe cobertura de plan con id "${ideCoveragePlan}"`);
    return row.IdeCoveragePlan;
  }

  private async resolveCurrency(codCurrency: string): Promise<string> {
    const row = await this.prisma.sCurrency.findFirst({ where: { CodCurrency: codCurrency } });
    if (!row) throw new NotFoundException(`No existe moneda con código "${codCurrency}"`);
    return row.IdeCurrency;
  }

  private async resolveRol(codRol: string): Promise<string> {
    const row = await this.prisma.tRol.findUnique({ where: { CodRol: codRol } });
    if (!row) throw new NotFoundException(`No existe rol con código "${codRol}"`);
    return row.IdeRol;
  }
}
