import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SCoverageGuarantee } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateCoverageGuaranteeDto } from './dto/create-coverage-guarantee.dto';
import { UpdateCoverageGuaranteeDto } from './dto/update-coverage-guarantee.dto';
import { ListCoverageGuaranteesDto } from './dto/list-coverage-guarantees.dto';

const INCLUDE = {
  SGuarantee: true,
  SDeductibleType: true,
  SLimitType: true,
  SCoveragePlan: true,
  SState: true,
} as const;

/**
 * `SCoverageGuarantee` -- mismo criterio que `CoveragePlansService` (ver
 * su doc-comment): bespoke en vez de `CatalogCrudService` porque no
 * tiene `Cod`/`Des` propio. Agregada 2026-09-27 (cierre del pendiente
 * chico de Siniestros Etapa 2, ver `docs/02-roadmap.md`) -- la tabla y
 * su consumidor (`GuaranteeProvisionsService`, `POST
 * coverage-provisions/:id/guarantee-provisions` en `claims-service`) ya
 * existían desde esa etapa, pero sin ningún CRUD/listado expuesto para
 * armar las garantías de un plan antes de que un siniestro las pueda
 * usar.
 */
@Injectable()
export class CoverageGuaranteesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(query: ListCoverageGuaranteesDto): Promise<SCoverageGuarantee[]> {
    const where: Prisma.SCoverageGuaranteeWhereInput = {};
    if (query.ideCoveragePlan) {
      where.IdeCoveragePlan = query.ideCoveragePlan;
    }
    if (query.codGuarantee) {
      where.SGuarantee = { CodGuarantee: query.codGuarantee };
    }
    return this.prisma.sCoverageGuarantee.findMany({ where, orderBy: { Order: 'asc' }, include: INCLUDE });
  }

  async findOne(id: string): Promise<SCoverageGuarantee> {
    const row = await this.prisma.sCoverageGuarantee.findUnique({
      where: { IdeCoverageGuarantee: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe garantía de cobertura con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateCoverageGuaranteeDto, actor: string): Promise<SCoverageGuarantee> {
    const ideGuarantee = await this.resolveGuarantee(dto.codGuarantee);
    const ideDeductibleType = await this.resolveDeductibleType(dto.codDeductibleType);
    const ideLimitType = await this.resolveLimitType(dto.codLimitType);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();

    return this.prisma.sCoverageGuarantee.create({
      data: {
        IdeCoveragePlan: dto.ideCoveragePlan,
        IdeGuarantee: ideGuarantee,
        DesShort: dto.desShort,
        DesLarge: dto.desLarge,
        TstInitial: new Date(dto.tstInitial),
        TstEnd: dto.tstEnd ? new Date(dto.tstEnd) : undefined,
        IndCoverageAccumulate: dto.indCoverageAccumulate,
        IdeDeductibleType: ideDeductibleType,
        DeductibleTypeValue: dto.deductibleTypeValue,
        IdeLimitType: ideLimitType,
        LimitTypeValue: dto.limitTypeValue,
        NumApplyUse: dto.numApplyUse,
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

  async update(id: string, dto: UpdateCoverageGuaranteeDto, actor: string): Promise<SCoverageGuarantee> {
    await this.findOne(id);

    const data: Prisma.SCoverageGuaranteeUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.ideCoveragePlan !== undefined) data.IdeCoveragePlan = dto.ideCoveragePlan;
    if (dto.codGuarantee !== undefined) data.IdeGuarantee = await this.resolveGuarantee(dto.codGuarantee);
    if (dto.desShort !== undefined) data.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) data.DesLarge = dto.desLarge;
    if (dto.tstInitial !== undefined) data.TstInitial = new Date(dto.tstInitial);
    if (dto.tstEnd !== undefined) data.TstEnd = new Date(dto.tstEnd);
    if (dto.indCoverageAccumulate !== undefined) data.IndCoverageAccumulate = dto.indCoverageAccumulate;
    if (dto.codDeductibleType !== undefined) {
      data.IdeDeductibleType = await this.resolveDeductibleType(dto.codDeductibleType);
    }
    if (dto.deductibleTypeValue !== undefined) data.DeductibleTypeValue = dto.deductibleTypeValue;
    if (dto.codLimitType !== undefined) {
      data.IdeLimitType = await this.resolveLimitType(dto.codLimitType);
    }
    if (dto.limitTypeValue !== undefined) data.LimitTypeValue = dto.limitTypeValue;
    if (dto.numApplyUse !== undefined) data.NumApplyUse = dto.numApplyUse;
    if (dto.order !== undefined) data.Order = dto.order;

    return this.prisma.sCoverageGuarantee.update({ where: { IdeCoverageGuarantee: id }, data, include: INCLUDE });
  }

  async setState(id: string, codState: string, actor: string): Promise<SCoverageGuarantee> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sCoverageGuarantee.update({
      where: { IdeCoverageGuarantee: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveGuarantee(codGuarantee: string): Promise<string> {
    const guarantee = await this.prisma.sGuarantee.findFirst({ where: { CodGuarantee: codGuarantee } });
    if (!guarantee) {
      throw new NotFoundException(`No existe garantía con código "${codGuarantee}"`);
    }
    return guarantee.IdeGuarantee;
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
