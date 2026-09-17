import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SCalculationRule } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateCalculationRuleDto } from './dto/create-calculation-rule.dto';
import { UpdateCalculationRuleDto } from './dto/update-calculation-rule.dto';
import { ListCalculationRulesDto } from './dto/list-calculation-rules.dto';

const INCLUDE = {
  SConcept: true,
  SCoveragePlan: true,
  SPlanProductRisk: true,
  SProduct: true,
  SState: true,
} as const;

/**
 * `SCalculationRule` — la respuesta real (no el script `db:seed-example-rules`,
 * que era un atajo de prueba) a "cómo se da de alta una fórmula nueva".
 * Tiene `Cod`/`Des` único, así que reutiliza `CatalogCrudService` como
 * `SProduct`/`SPlanProduct`/`SCoverage`; lo que la distingue es la
 * jerarquía de aplicabilidad (`IdeProduct`/`IdePlanProductRisk` NULL como
 * comodín, `IdeCoveragePlan` siempre exacto — ver
 * `PrismaCalculationRuleRepository`) y la validación de `FormulaJSON`
 * (claves `IF`/`THEN`/`ELSE`, ver `FormulaDto`) antes de guardar, para no
 * descubrir un JSON mal formado recién al evaluar la regla en producción.
 */
@Injectable()
export class CalculationRulesService {
  private readonly crud: CatalogCrudService<SCalculationRule>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SCalculationRule>(
      this.prisma.sCalculationRule,
      'CodCalculationRule',
      'DesCalculationRule',
      'IdeCalculationRule',
      'regla de cálculo',
      INCLUDE,
    );
  }

  findAll(query: ListCalculationRulesDto): Promise<SCalculationRule[]> {
    const where: Prisma.SCalculationRuleWhereInput = {};
    if (query.ideCoveragePlan) {
      where.IdeCoveragePlan = query.ideCoveragePlan;
    }
    return this.prisma.sCalculationRule.findMany({
      where,
      orderBy: { Order: 'asc' },
      include: INCLUDE,
    });
  }

  findOne(id: string): Promise<SCalculationRule> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateCalculationRuleDto, actor: string): Promise<SCalculationRule> {
    const extra = await this.buildExtra(dto);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codCalculationRule,
      dto.desCalculationRule,
      extra,
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateCalculationRuleDto, actor: string): Promise<SCalculationRule> {
    const extra = await this.buildExtra(dto);
    return this.crud.update(id, dto.desCalculationRule, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SCalculationRule> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async buildExtra(
    dto: CreateCalculationRuleDto | UpdateCalculationRuleDto,
  ): Promise<Record<string, unknown>> {
    const extra: Record<string, unknown> = {};
    if (dto.order !== undefined) extra.Order = dto.order;
    if (dto.desColumnName !== undefined) extra.DesColumnName = dto.desColumnName;
    if (dto.ideCoveragePlan !== undefined) extra.IdeCoveragePlan = dto.ideCoveragePlan;
    if (dto.idePlanProductRisk !== undefined) extra.IdePlanProductRisk = dto.idePlanProductRisk;
    if (dto.formula !== undefined) {
      extra.FormulaJSON = {
        IF: dto.formula.if,
        THEN: dto.formula.then,
        ELSE: dto.formula.else,
      } satisfies Prisma.InputJsonValue;
    }
    if (dto.codProduct !== undefined) {
      const product = await this.prisma.sProduct.findFirst({
        where: { CodProduct: dto.codProduct },
      });
      if (!product) {
        throw new NotFoundException(`No existe producto con código "${dto.codProduct}"`);
      }
      extra.IdeProduct = product.IdeProduct;
    }
    if (dto.codConcept !== undefined) {
      const concept = await this.prisma.sConcept.findFirst({
        where: { CodConcept: dto.codConcept },
      });
      if (!concept) {
        throw new NotFoundException(`No existe concepto con código "${dto.codConcept}"`);
      }
      extra.IdeConcept = concept.IdeConcept;
    }
    if (dto.codEntityReference !== undefined) {
      const entity = await this.prisma.sEntity.findFirst({
        where: { CodEntity: dto.codEntityReference },
      });
      if (!entity) {
        throw new NotFoundException(`No existe entidad con código "${dto.codEntityReference}"`);
      }
      // La FK real es por código (CodEntityReference -> SEntity.CodEntity), no por id.
      extra.CodEntityReference = dto.codEntityReference;
    }
    return extra;
  }
}
