import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SProduct } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

/**
 * `SProduct` — la raíz del árbol de configuración de negocio
 * (Producto > RiskProduct > PlanProduct > PlanProductRisk > CoveragePlan).
 * Igual que los catálogos de `../catalogs`, tiene la forma `Cod`/`Des`
 * única, así que reutiliza `CatalogCrudService` en vez de repetir
 * Create/List/Get/Update/SetState a mano.
 */
@Injectable()
export class ProductsService {
  private readonly crud: CatalogCrudService<SProduct>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SProduct>(
      this.prisma.sProduct,
      'CodProduct',
      'DesProduct',
      'IdeProduct',
      'producto',
      { SInsuranceArea: true, SCurrency: true, SState: true },
    );
  }

  findAll(): Promise<SProduct[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SProduct> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateProductDto, actor: string): Promise<SProduct> {
    const extra = await this.buildExtra(dto);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codProduct, dto.desProduct, extra, activeStateId, actor);
  }

  async update(id: string, dto: UpdateProductDto, actor: string): Promise<SProduct> {
    const extra = await this.buildExtra(dto);
    return this.crud.update(id, dto.desProduct, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SProduct> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async buildExtra(
    dto: CreateProductDto | UpdateProductDto,
  ): Promise<Record<string, unknown>> {
    const extra: Record<string, unknown> = {};
    if (dto.desShort !== undefined) extra.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) extra.DesLarge = dto.desLarge;
    if (dto.image !== undefined) extra.Image = dto.image;
    if (dto.validityDays !== undefined) extra.ValidityDays = dto.validityDays;
    if (dto.codStartTime !== undefined) extra.CodStartTime = dto.codStartTime;
    if (dto.indGenerateAllFraction !== undefined) {
      extra.IndGenerateAllFraction = dto.indGenerateAllFraction;
    }
    if (dto.indProportionalPrime !== undefined) {
      extra.IndProportionalPrime = dto.indProportionalPrime;
    }
    if (dto.tstInitial !== undefined) extra.TstInitial = new Date(dto.tstInitial);
    if (dto.tstEnd !== undefined) extra.TstEnd = new Date(dto.tstEnd);

    if (dto.codInsuranceArea !== undefined) {
      const area = await this.prisma.sInsuranceArea.findFirst({
        where: { CodInsuranceArea: dto.codInsuranceArea },
      });
      if (!area) {
        throw new NotFoundException(`No existe ramo de seguro con código "${dto.codInsuranceArea}"`);
      }
      extra.IdeInsuranceArea = area.IdeInsuranceArea;
    }
    if (dto.codCurrency !== undefined) {
      const currency = await this.prisma.sCurrency.findFirst({
        where: { CodCurrency: dto.codCurrency },
      });
      if (!currency) {
        throw new NotFoundException(`No existe moneda con código "${dto.codCurrency}"`);
      }
      extra.IdeCurrency = currency.IdeCurrency;
    }
    return extra;
  }
}
