import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SCoveragePlan } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateCoveragePlanDto } from './dto/create-coverage-plan.dto';
import { UpdateCoveragePlanDto } from './dto/update-coverage-plan.dto';
import { ListCoveragePlansDto } from './dto/list-coverage-plans.dto';

const INCLUDE = {
  SCoverage: true,
  SDeductibleType: true,
  SLimitType: true,
  SPlanProductRisk: true,
  SState: true,
} as const;

/**
 * `SCoveragePlan` — la configuración concreta de una cobertura dentro de
 * un plan de riesgo (deducible, límite, rangos de monto/tasa/prima,
 * obligatoriedad, etc.). Es el nivel de jerarquía que `SCalculationRule`
 * exige siempre (`IdeCoveragePlan` NOT NULL, ver
 * `docs/01-especificacion-motor-negocio-actual.md`, §3), así que
 * `create`/`update` devuelven el registro completo: el consumidor
 * necesita el `IdeCoveragePlan` resultante para poder dar de alta reglas
 * de cálculo sobre esta cobertura.
 *
 * Sin `Cod`/`Des` propios (solo `DesShort`/`DesLarge` opcionales) —
 * bespoke en vez de `CatalogCrudService`, igual que `SRiskProduct`/
 * `SPlanProductRisk`.
 */
@Injectable()
export class CoveragePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(query: ListCoveragePlansDto): Promise<SCoveragePlan[]> {
    const where: Prisma.SCoveragePlanWhereInput = {};
    if (query.idePlanProductRisk) {
      where.IdePlanProductRisk = query.idePlanProductRisk;
    }
    if (query.codCoverage) {
      where.SCoverage = { CodCoverage: query.codCoverage };
    }
    return this.prisma.sCoveragePlan.findMany({ where, orderBy: { Order: 'asc' }, include: INCLUDE });
  }

  async findOne(id: string): Promise<SCoveragePlan> {
    const row = await this.prisma.sCoveragePlan.findUnique({
      where: { IdeCoveragePlan: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe cobertura de plan con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateCoveragePlanDto, actor: string): Promise<SCoveragePlan> {
    const ideCoverage = await this.resolveCoverage(dto.codCoverage);
    const ideDeductibleType = await this.resolveDeductibleType(dto.codDeductibleType);
    const ideLimitType = await this.resolveLimitType(dto.codLimitType);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();

    return this.prisma.sCoveragePlan.create({
      data: {
        IdePlanProductRisk: dto.idePlanProductRisk,
        IdeCoverage: ideCoverage,
        DesShort: dto.desShort,
        DesLarge: dto.desLarge,
        IndMandatory: dto.indMandatory,
        GetPrime: dto.getPrime,
        RefundPrime: dto.refundPrime,
        ProratedGetPrime: dto.proratedGetPrime,
        ProratedRefundPrime: dto.proratedRefundPrime,
        NumMonthsWaitingPeriod: dto.numMonthsWaitingPeriod,
        IndSplitPayment: dto.indSplitPayment,
        IdeDeductibleType: ideDeductibleType,
        DeductibleTypeValue: dto.deductibleTypeValue,
        IdeLimitType: ideLimitType,
        LimitTypeValue: dto.limitTypeValue,
        IndPayPerUse: dto.indPayPerUse,
        IndFixedAmount: dto.indFixedAmount,
        LowerAmount: dto.lowerAmount,
        UpperAmount: dto.upperAmount,
        IndFixedRate: dto.indFixedRate,
        LowerRate: dto.lowerRate,
        UpperRate: dto.upperRate,
        IndFixedPrime: dto.indFixedPrime,
        LowerPrime: dto.lowerPrime,
        UpperPrime: dto.upperPrime,
        TstInitial: new Date(dto.tstInitial),
        TstEnd: dto.tstEnd ? new Date(dto.tstEnd) : undefined,
        InclusiveCoverage: dto.inclusiveCoverage as Prisma.InputJsonValue | undefined,
        ExclusiveCoverage: dto.exclusiveCoverage as Prisma.InputJsonValue | undefined,
        Order: dto.order,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateCoveragePlanDto, actor: string): Promise<SCoveragePlan> {
    await this.findOne(id);

    const data: Prisma.SCoveragePlanUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.idePlanProductRisk !== undefined) data.IdePlanProductRisk = dto.idePlanProductRisk;
    if (dto.codCoverage !== undefined) data.IdeCoverage = await this.resolveCoverage(dto.codCoverage);
    if (dto.desShort !== undefined) data.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) data.DesLarge = dto.desLarge;
    if (dto.indMandatory !== undefined) data.IndMandatory = dto.indMandatory;
    if (dto.getPrime !== undefined) data.GetPrime = dto.getPrime;
    if (dto.refundPrime !== undefined) data.RefundPrime = dto.refundPrime;
    if (dto.proratedGetPrime !== undefined) data.ProratedGetPrime = dto.proratedGetPrime;
    if (dto.proratedRefundPrime !== undefined) data.ProratedRefundPrime = dto.proratedRefundPrime;
    if (dto.numMonthsWaitingPeriod !== undefined) {
      data.NumMonthsWaitingPeriod = dto.numMonthsWaitingPeriod;
    }
    if (dto.indSplitPayment !== undefined) data.IndSplitPayment = dto.indSplitPayment;
    if (dto.codDeductibleType !== undefined) {
      data.IdeDeductibleType = await this.resolveDeductibleType(dto.codDeductibleType);
    }
    if (dto.deductibleTypeValue !== undefined) data.DeductibleTypeValue = dto.deductibleTypeValue;
    if (dto.codLimitType !== undefined) {
      data.IdeLimitType = await this.resolveLimitType(dto.codLimitType);
    }
    if (dto.limitTypeValue !== undefined) data.LimitTypeValue = dto.limitTypeValue;
    if (dto.indPayPerUse !== undefined) data.IndPayPerUse = dto.indPayPerUse;
    if (dto.indFixedAmount !== undefined) data.IndFixedAmount = dto.indFixedAmount;
    if (dto.lowerAmount !== undefined) data.LowerAmount = dto.lowerAmount;
    if (dto.upperAmount !== undefined) data.UpperAmount = dto.upperAmount;
    if (dto.indFixedRate !== undefined) data.IndFixedRate = dto.indFixedRate;
    if (dto.lowerRate !== undefined) data.LowerRate = dto.lowerRate;
    if (dto.upperRate !== undefined) data.UpperRate = dto.upperRate;
    if (dto.indFixedPrime !== undefined) data.IndFixedPrime = dto.indFixedPrime;
    if (dto.lowerPrime !== undefined) data.LowerPrime = dto.lowerPrime;
    if (dto.upperPrime !== undefined) data.UpperPrime = dto.upperPrime;
    if (dto.tstInitial !== undefined) data.TstInitial = new Date(dto.tstInitial);
    if (dto.tstEnd !== undefined) data.TstEnd = new Date(dto.tstEnd);
    if (dto.inclusiveCoverage !== undefined) {
      data.InclusiveCoverage = dto.inclusiveCoverage as Prisma.InputJsonValue;
    }
    if (dto.exclusiveCoverage !== undefined) {
      data.ExclusiveCoverage = dto.exclusiveCoverage as Prisma.InputJsonValue;
    }
    if (dto.order !== undefined) data.Order = dto.order;

    return this.prisma.sCoveragePlan.update({ where: { IdeCoveragePlan: id }, data, include: INCLUDE });
  }

  async setState(id: string, codState: string, actor: string): Promise<SCoveragePlan> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sCoveragePlan.update({
      where: { IdeCoveragePlan: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveCoverage(codCoverage: string): Promise<string> {
    const coverage = await this.prisma.sCoverage.findFirst({ where: { CodCoverage: codCoverage } });
    if (!coverage) {
      throw new NotFoundException(`No existe cobertura con código "${codCoverage}"`);
    }
    return coverage.IdeCoverage;
  }

  private async resolveDeductibleType(codDeductibleType: string): Promise<string> {
    const deductibleType = await this.prisma.sDeductibleType.findFirst({
      where: { CodDeductibleType: codDeductibleType },
    });
    if (!deductibleType) {
      throw new NotFoundException(`No existe tipo de deducible con código "${codDeductibleType}"`);
    }
    return deductibleType.IdeDeductibleType;
  }

  private async resolveLimitType(codLimitType: string): Promise<string> {
    const limitType = await this.prisma.sLimitType.findFirst({
      where: { CodLimitType: codLimitType },
    });
    if (!limitType) {
      throw new NotFoundException(`No existe tipo de límite con código "${codLimitType}"`);
    }
    return limitType.IdeLimitType;
  }
}
