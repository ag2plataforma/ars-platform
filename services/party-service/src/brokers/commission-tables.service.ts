import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SCommissionTable } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateCommissionTableDto } from './dto/create-commission-table.dto';
import { UpdateCommissionTableDto } from './dto/update-commission-table.dto';
import { ListCommissionTablesDto } from './dto/list-commission-tables.dto';

const INCLUDE = { SCommissionTree: true, SCommission: true, SState: true } as const;

/**
 * `SCommissionTable` -- dentro de un árbol de comisión, la tabla
 * aplicable a un producto (y opcionalmente a un plan/cobertura más
 * específico -- `idePlanProductRisk`/`ideCoveragePlan` NULL = comodín,
 * mismo criterio que `resolveCommissionPercentage` en
 * `underwriting-service`, que ya hace este match exacto). Sin función
 * PL/pgSQL propia de escritura. `Cod`/`Des` únicos, reutiliza
 * `CatalogCrudService`.
 *
 * `idePlanProductRisk`/`ideCoveragePlan` se reciben como uuid crudo (no
 * tienen código propio -- son tablas de unión, ver
 * `product-rating-service/README.md`) en vez de resolverse por código.
 */
@Injectable()
export class CommissionTablesService {
  private readonly crud: CatalogCrudService<SCommissionTable>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SCommissionTable>(
      prisma.sCommissionTable,
      'CodCommissionTable',
      'DesCommissionTable',
      'IdeCommissionTable',
      'tabla de comisión',
      INCLUDE,
    );
  }

  findAll(query: ListCommissionTablesDto): Promise<SCommissionTable[]> {
    const where: Prisma.SCommissionTableWhereInput = {};
    if (query.codCommissionTree) {
      where.SCommissionTree = { CodCommissionTree: query.codCommissionTree };
    }
    if (query.codProduct) {
      where.SProduct = { CodProduct: query.codProduct };
    }
    return this.prisma.sCommissionTable.findMany({
      where,
      include: INCLUDE,
      orderBy: { DesCommissionTable: 'asc' },
    });
  }

  findOne(id: string): Promise<SCommissionTable> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateCommissionTableDto, actor: string): Promise<SCommissionTable> {
    const ideCommissionTree = await this.resolveCommissionTree(dto.codCommissionTree);
    const ideProduct = await this.resolveProduct(dto.codProduct);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codCommissionTable,
      dto.desCommissionTable,
      {
        IdeCommissionTree: ideCommissionTree,
        IdeProduct: ideProduct,
        IdePlanProductRisk: dto.idePlanProductRisk,
        IdeCoveragePlan: dto.ideCoveragePlan,
      },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateCommissionTableDto, actor: string): Promise<SCommissionTable> {
    const extra: Record<string, unknown> = {};
    if (dto.codCommissionTree !== undefined) {
      extra.IdeCommissionTree = await this.resolveCommissionTree(dto.codCommissionTree);
    }
    if (dto.codProduct !== undefined) {
      extra.IdeProduct = await this.resolveProduct(dto.codProduct);
    }
    if (dto.idePlanProductRisk !== undefined) {
      extra.IdePlanProductRisk = dto.idePlanProductRisk;
    }
    if (dto.ideCoveragePlan !== undefined) {
      extra.IdeCoveragePlan = dto.ideCoveragePlan;
    }
    return this.crud.update(id, dto.desCommissionTable, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SCommissionTable> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveCommissionTree(codCommissionTree: string): Promise<string> {
    const tree = await this.prisma.sCommissionTree.findFirst({ where: { CodCommissionTree: codCommissionTree } });
    if (!tree) {
      throw new NotFoundException(`No existe árbol de comisión con código "${codCommissionTree}"`);
    }
    return tree.IdeCommissionTree;
  }

  private async resolveProduct(codProduct: string): Promise<string> {
    const product = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct } });
    if (!product) {
      throw new NotFoundException(`No existe producto con código "${codProduct}"`);
    }
    return product.IdeProduct;
  }
}
