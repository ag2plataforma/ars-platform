import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SPlanProduct } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '../catalogs/catalog-crud.service';
import { CreatePlanProductDto } from './dto/create-plan-product.dto';
import { UpdatePlanProductDto } from './dto/update-plan-product.dto';

@Injectable()
export class PlanProductsService {
  private readonly crud: CatalogCrudService<SPlanProduct>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SPlanProduct>(
      this.prisma.sPlanProduct,
      'CodPlanProduct',
      'DesPlanProduct',
      'IdePlanProduct',
      'plan de producto',
      { SProduct: true, SState: true },
    );
  }

  findAll(): Promise<SPlanProduct[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SPlanProduct> {
    return this.crud.findOne(id);
  }

  async create(dto: CreatePlanProductDto, actor: string): Promise<SPlanProduct> {
    const extra = await this.buildExtra(dto);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codPlanProduct, dto.desPlanProduct, extra, activeStateId, actor);
  }

  async update(id: string, dto: UpdatePlanProductDto, actor: string): Promise<SPlanProduct> {
    const extra = await this.buildExtra(dto);
    return this.crud.update(id, dto.desPlanProduct, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SPlanProduct> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async buildExtra(
    dto: CreatePlanProductDto | UpdatePlanProductDto,
  ): Promise<Record<string, unknown>> {
    const extra: Record<string, unknown> = {};
    if (dto.desShort !== undefined) extra.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) extra.DesLarge = dto.desLarge;
    if (dto.tstInitial !== undefined) extra.TstInitial = new Date(dto.tstInitial);
    if (dto.tstEnd !== undefined) extra.TstEnd = new Date(dto.tstEnd);
    if (dto.codProduct !== undefined) {
      const product = await this.prisma.sProduct.findFirst({
        where: { CodProduct: dto.codProduct },
      });
      if (!product) {
        throw new NotFoundException(`No existe producto con código "${dto.codProduct}"`);
      }
      extra.IdeProduct = product.IdeProduct;
    }
    return extra;
  }
}
