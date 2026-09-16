import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SRiskProduct } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateRiskProductDto } from './dto/create-risk-product.dto';
import { UpdateRiskProductDto } from './dto/update-risk-product.dto';

const INCLUDE = { SProduct: true, SRisk: true, SRiskType: true, SState: true } as const;

/**
 * `SRiskProduct` — qué riesgo (y de qué tipo) cubre un producto. A
 * diferencia de `SProduct`/`SPlanProduct`/`SCoverage` no tiene un único
 * campo `Des<X>` (solo `DesShort`/`DesLarge`, ambos opcionales), así que
 * no reutiliza `CatalogCrudService` — se escribe explícito, mismo estilo
 * que `UsersService` en iam-service.
 */
@Injectable()
export class RiskProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(): Promise<SRiskProduct[]> {
    return this.prisma.sRiskProduct.findMany({ orderBy: { CodRiskProduct: 'asc' }, include: INCLUDE });
  }

  async findOne(id: string): Promise<SRiskProduct> {
    const row = await this.prisma.sRiskProduct.findUnique({
      where: { IdeRiskProduct: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe riesgo de producto con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateRiskProductDto, actor: string): Promise<SRiskProduct> {
    const existing = await this.prisma.sRiskProduct.findFirst({
      where: { CodRiskProduct: dto.codRiskProduct },
    });
    if (existing) {
      throw new ConflictException(`Ya existe riesgo de producto con código "${dto.codRiskProduct}"`);
    }
    const ideProduct = await this.resolveProduct(dto.codProduct);
    const ideRisk = await this.resolveRisk(dto.codRisk);
    const ideRiskType = await this.resolveRiskType(dto.codRiskType);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();

    return this.prisma.sRiskProduct.create({
      data: {
        CodRiskProduct: dto.codRiskProduct,
        DesShort: dto.desShort,
        DesLarge: dto.desLarge,
        Image: dto.image,
        IdeProduct: ideProduct,
        IdeRisk: ideRisk,
        IdeRiskType: ideRiskType,
        TstInitial: new Date(dto.tstInitial),
        TstEnd: dto.tstEnd ? new Date(dto.tstEnd) : undefined,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateRiskProductDto, actor: string): Promise<SRiskProduct> {
    await this.findOne(id);

    const data: Prisma.SRiskProductUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.desShort !== undefined) data.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) data.DesLarge = dto.desLarge;
    if (dto.image !== undefined) data.Image = dto.image;
    if (dto.tstInitial !== undefined) data.TstInitial = new Date(dto.tstInitial);
    if (dto.tstEnd !== undefined) data.TstEnd = new Date(dto.tstEnd);
    if (dto.codProduct !== undefined) data.IdeProduct = await this.resolveProduct(dto.codProduct);
    if (dto.codRisk !== undefined) data.IdeRisk = await this.resolveRisk(dto.codRisk);
    if (dto.codRiskType !== undefined) data.IdeRiskType = await this.resolveRiskType(dto.codRiskType);

    return this.prisma.sRiskProduct.update({
      where: { IdeRiskProduct: id },
      data,
      include: INCLUDE,
    });
  }

  async setState(id: string, codState: string, actor: string): Promise<SRiskProduct> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sRiskProduct.update({
      where: { IdeRiskProduct: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveProduct(codProduct: string): Promise<string> {
    const product = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct } });
    if (!product) {
      throw new NotFoundException(`No existe producto con código "${codProduct}"`);
    }
    return product.IdeProduct;
  }

  private async resolveRisk(codRisk: string): Promise<string> {
    const risk = await this.prisma.sRisk.findFirst({ where: { CodRisk: codRisk } });
    if (!risk) {
      throw new NotFoundException(`No existe riesgo con código "${codRisk}"`);
    }
    return risk.IdeRisk;
  }

  private async resolveRiskType(codRiskType: string): Promise<string> {
    const riskType = await this.prisma.sRiskType.findFirst({ where: { CodRiskType: codRiskType } });
    if (!riskType) {
      throw new NotFoundException(`No existe tipo de riesgo con código "${codRiskType}"`);
    }
    return riskType.IdeRiskType;
  }
}
