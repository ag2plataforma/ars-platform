import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SProductPaymentFraction } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateProductPaymentFractionDto } from './dto/create-product-payment-fraction.dto';
import { UpdateProductPaymentFractionDto } from './dto/update-product-payment-fraction.dto';
import { ListProductPaymentFractionsDto } from './dto/list-product-payment-fractions.dto';

const INCLUDE = { SProduct: true, SPaymentFraction: true, SState: true } as const;

/**
 * `SProductPaymentFraction` -- qué fracciones de pago se le ofrecen a un
 * producto, con su recargo (`PorSurCharge`, en %) y vigencia. Es lo que lee
 * `underwriting-service` al contratar (`ContractsService.resolvePaymentFraction`,
 * `listPaymentFractionOptions`) y al calcular la prima de cada cuota: solo
 * se ofrecen las filas en estado ACTIVO y vigentes hoy, cuya fracción del
 * catálogo también esté ACTIVA.
 */
@Injectable()
export class ProductPaymentFractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async findAll(query: ListProductPaymentFractionsDto): Promise<SProductPaymentFraction[]> {
    const where: Prisma.SProductPaymentFractionWhereInput = {};
    if (query.codProduct) where.SProduct = { CodProduct: query.codProduct };
    const rows = await this.prisma.sProductPaymentFraction.findMany({ where, include: INCLUDE });
    return rows.sort((a, b) => a.SPaymentFraction.NumOrder - b.SPaymentFraction.NumOrder);
  }

  async findOne(id: string): Promise<SProductPaymentFraction> {
    const row = await this.prisma.sProductPaymentFraction.findUnique({
      where: { IdeProductPaymentFraction: id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException(`No existe fracción de pago de producto con id "${id}"`);
    return row;
  }

  async create(dto: CreateProductPaymentFractionDto, actor: string): Promise<SProductPaymentFraction> {
    const tstInitial = this.parseDate(dto.tstInitial);
    const tstEnd = this.parseDate(dto.tstEnd);
    this.assertRange(tstInitial, tstEnd);

    const [product, fraction] = await Promise.all([
      this.prisma.sProduct.findFirst({ where: { CodProduct: dto.codProduct } }),
      this.prisma.sPaymentFraction.findFirst({ where: { CodPaymentFraction: dto.codPaymentFraction } }),
    ]);
    if (!product) throw new NotFoundException(`No existe producto con código "${dto.codProduct}"`);
    if (!fraction) throw new NotFoundException(`No existe fracción de pago con código "${dto.codPaymentFraction}"`);

    await this.assertFractionAllowedByValidity(product.IdeProduct, fraction, dto.codProduct);

    const existing = await this.prisma.sProductPaymentFraction.findFirst({
      where: { IdeProduct: product.IdeProduct, IdePaymentFraction: fraction.IdePaymentFraction },
    });
    if (existing) {
      throw new ConflictException(
        `El producto "${dto.codProduct}" ya tiene configurada la fracción "${dto.codPaymentFraction}" -- editá esa fila en vez de crear otra`,
      );
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sProductPaymentFraction.create({
      data: {
        IdeProduct: product.IdeProduct,
        IdePaymentFraction: fraction.IdePaymentFraction,
        TstInitial: tstInitial,
        TstEnd: tstEnd,
        PorSurCharge: dto.porSurCharge,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateProductPaymentFractionDto, actor: string): Promise<SProductPaymentFraction> {
    const current = await this.findOne(id);
    const tstInitial = dto.tstInitial ? this.parseDate(dto.tstInitial) : current.TstInitial;
    const tstEnd = dto.tstEnd ? this.parseDate(dto.tstEnd) : current.TstEnd;
    this.assertRange(tstInitial, tstEnd);
    return this.prisma.sProductPaymentFraction.update({
      where: { IdeProductPaymentFraction: id },
      data: {
        TstInitial: tstInitial,
        TstEnd: tstEnd,
        ...(dto.porSurCharge !== undefined ? { PorSurCharge: dto.porSurCharge } : {}),
        UsrModification: actor,
        TstModification: new Date(),
      },
      include: INCLUDE,
    });
  }

  async setState(id: string, codState: string, actor: string): Promise<SProductPaymentFraction> {
    const current = await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    if (codState.toUpperCase() === 'ACTIVO') {
      const [fraction, product] = await Promise.all([
        this.prisma.sPaymentFraction.findUniqueOrThrow({ where: { IdePaymentFraction: current.IdePaymentFraction } }),
        this.prisma.sProduct.findUniqueOrThrow({ where: { IdeProduct: current.IdeProduct } }),
      ]);
      await this.assertFractionAllowedByValidity(current.IdeProduct, fraction, product.CodProduct);
    }
    return this.prisma.sProductPaymentFraction.update({
      where: { IdeProductPaymentFraction: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  /**
   * Un producto de vigencia TEMPORAL (`SValidityType.IndAnnual = false`) solo admite el fraccionamiento único
   * (`NumFraction = 1`); el de vigencia ANUAL admite cualquiera (anual, semestral, trimestral...).
   */
  private async assertFractionAllowedByValidity(
    ideProduct: string,
    fraction: { NumFraction: number; DesPaymentFraction: string },
    codProduct: string,
  ): Promise<void> {
    const validityType = await this.prisma.sProductValidityType.findFirst({
      where: { IdeProduct: ideProduct, SState: { CodState: 'ACTIVO' } },
      include: { SValidityType: true },
    });
    if (validityType && !validityType.SValidityType.IndAnnual && fraction.NumFraction > 1) {
      throw new BadRequestException(
        `El producto "${codProduct}" tiene vigencia temporal ("${validityType.SValidityType.DesValidityType}"): solo admite el fraccionamiento único, no "${fraction.DesPaymentFraction}"`,
      );
    }
  }

  private parseDate(value: string): Date {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Fecha inválida: "${value}"`);
    return date;
  }

  private assertRange(tstInitial: Date, tstEnd: Date): void {
    if (tstEnd.getTime() < tstInitial.getTime()) {
      throw new BadRequestException('La vigencia hasta no puede ser anterior a la vigencia desde');
    }
  }
}
