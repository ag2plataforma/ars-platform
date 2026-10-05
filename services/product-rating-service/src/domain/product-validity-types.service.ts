import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SProductValidityType } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateProductValidityTypeDto } from './dto/create-product-validity-type.dto';
import { UpdateProductValidityTypeDto } from './dto/update-product-validity-type.dto';
import { ListProductValidityTypesDto } from './dto/list-product-validity-types.dto';

const INCLUDE = { SProduct: true, SValidityType: true, SState: true } as const;

/**
 * `SProductValidityType` -- tipo de vigencia del producto (catálogo `SValidityType`).
 * `underwriting-service` lo lee al cotizar y al contratar (`ContractsService.buildContract`):
 * sin una fila ACTIVA el producto no se puede contratar. Se mantiene UNA fila activa por
 * producto (al contratar se toma la primera activa).
 */
@Injectable()
export class ProductValidityTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(query: ListProductValidityTypesDto): Promise<SProductValidityType[]> {
    const where: Prisma.SProductValidityTypeWhereInput = {};
    if (query.codProduct) where.SProduct = { CodProduct: query.codProduct };
    return this.prisma.sProductValidityType.findMany({ where, include: INCLUDE });
  }

  async findOne(id: string): Promise<SProductValidityType> {
    const row = await this.prisma.sProductValidityType.findUnique({
      where: { IdeProductValidityType: id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException(`No existe tipo de vigencia de producto con id "${id}"`);
    return row;
  }

  async create(dto: CreateProductValidityTypeDto, actor: string): Promise<SProductValidityType> {
    const [product, validityType] = await Promise.all([
      this.prisma.sProduct.findFirst({ where: { CodProduct: dto.codProduct } }),
      this.prisma.sValidityType.findFirst({ where: { CodValidityType: dto.codValidityType } }),
    ]);
    if (!product) throw new NotFoundException(`No existe producto con código "${dto.codProduct}"`);
    if (!validityType) throw new NotFoundException(`No existe tipo de vigencia con código "${dto.codValidityType}"`);

    const existing = await this.prisma.sProductValidityType.findFirst({
      where: { IdeProduct: product.IdeProduct, IdeValidityType: validityType.IdeValidityType },
    });
    if (existing) {
      throw new ConflictException(
        `El producto "${dto.codProduct}" ya tiene configurado el tipo de vigencia "${dto.codValidityType}" -- activá esa fila en vez de crear otra`,
      );
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sProductValidityType.create({
      data: {
        IdeProduct: product.IdeProduct,
        IdeValidityType: validityType.IdeValidityType,
        IndInitialDate: dto.indInitialDate ?? true,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateProductValidityTypeDto, actor: string): Promise<SProductValidityType> {
    await this.findOne(id);
    return this.prisma.sProductValidityType.update({
      where: { IdeProductValidityType: id },
      data: {
        ...(dto.indInitialDate !== undefined ? { IndInitialDate: dto.indInitialDate } : {}),
        UsrModification: actor,
        TstModification: new Date(),
      },
      include: INCLUDE,
    });
  }

  async setState(id: string, codState: string, actor: string): Promise<SProductValidityType> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sProductValidityType.update({
      where: { IdeProductValidityType: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }
}
