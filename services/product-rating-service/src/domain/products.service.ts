import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SProduct } from '@ars-platform/database';
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
  private readonly logger = new Logger(ProductsService.name);
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

  async findAll(): Promise<SProduct[]> {
    return this.withCollective(await this.crud.findAll());
  }

  async findOne(id: string): Promise<SProduct> {
    return (await this.withCollective([await this.crud.findOne(id)]))[0];
  }

  /**
   * Colectivos (`setup-collectives.js`): `IndCollective` y `CodCollectivePremiumMode` se
   * leen/escriben con SQL crudo hasta regenerar el cliente de Prisma. Si las columnas aún no
   * existen (script sin correr), el producto se devuelve igual, como no colectivo.
   */
  private async withCollective<T extends { IdeProduct: string }>(
    rows: T[],
  ): Promise<Array<T & { IndCollective: boolean; CodCollectivePremiumMode: string }>> {
    const found = new Map<string, { IndCollective: boolean; CodCollectivePremiumMode: string }>();
    if (rows.length > 0) {
      try {
        const data = await this.prisma.$queryRaw<
          Array<{ IdeProduct: string; IndCollective: boolean; CodCollectivePremiumMode: string }>
        >`SELECT "IdeProduct", "IndCollective", "CodCollectivePremiumMode" FROM ars_platform."SProduct"
           WHERE "IdeProduct" IN (${Prisma.join(rows.map((r) => Prisma.sql`${r.IdeProduct}::uuid`))})`;
        for (const d of data) found.set(d.IdeProduct, d);
      } catch (err) {
        this.logger.warn(`No se pudo leer IndCollective (¿falta correr setup-collectives.js?): ${(err as Error).message}`);
      }
    }
    return rows.map((r) => ({
      ...r,
      IndCollective: found.get(r.IdeProduct)?.IndCollective ?? false,
      CodCollectivePremiumMode: found.get(r.IdeProduct)?.CodCollectivePremiumMode ?? 'POR_CERTIFICADO',
    }));
  }

  private async saveCollective(
    id: string,
    dto: { indCollective?: boolean; codCollectivePremiumMode?: string },
  ): Promise<void> {
    if (dto.indCollective === undefined && dto.codCollectivePremiumMode === undefined) return;
    if (dto.indCollective !== undefined) {
      await this.prisma.$executeRaw`UPDATE ars_platform."SProduct" SET "IndCollective" = ${dto.indCollective} WHERE "IdeProduct" = ${id}::uuid`;
    }
    if (dto.codCollectivePremiumMode !== undefined) {
      await this.prisma.$executeRaw`UPDATE ars_platform."SProduct" SET "CodCollectivePremiumMode" = ${dto.codCollectivePremiumMode} WHERE "IdeProduct" = ${id}::uuid`;
    }
  }

  async create(dto: CreateProductDto, actor: string): Promise<SProduct> {
    const extra = await this.buildExtra(dto);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const created = await this.crud.create(dto.codProduct, dto.desProduct, extra, activeStateId, actor);
    await this.saveCollective(created.IdeProduct, dto);
    return this.findOne(created.IdeProduct);
  }

  async update(id: string, dto: UpdateProductDto, actor: string): Promise<SProduct> {
    const extra = await this.buildExtra(dto);
    await this.crud.update(id, dto.desProduct, extra, actor);
    await this.saveCollective(id, dto);
    return this.findOne(id);
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
