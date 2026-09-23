import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SCommissionProduct } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateCommissionProductDto } from './dto/create-commission-product.dto';
import { UpdateCommissionProductDto } from './dto/update-commission-product.dto';
import { ListCommissionProductsDto } from './dto/list-commission-products.dto';

const INCLUDE = { SProduct: true, SState: true } as const;

/**
 * `SCommissionProduct` -- split de comisión de un producto entre un canal
 * de distribución de ORIGEN (el de la cotización) y uno o más de DESTINO,
 * consumido por `FContractDistributionChannel('SETQUOTE', ...)` en
 * `underwriting-service` (`setContractDistributionChannel`), confirmado
 * línea por línea contra el código fuente real. Sin `Cod`/`Des` propio,
 * se escribe a mano igual que `SCommission`.
 *
 * A diferencia de `SCommission`, esta tabla NO tiene ninguna lógica real
 * de "última versión" que replicar: `FContractDistributionChannel` toma
 * TODAS las filas `Activa` que matcheen (producto, canal origen) sin
 * filtrar por `NumMovement` ni vigencia -- confirmado, no es una omisión
 * de esta implementación. Por eso el CRUD, a propósito (decisión
 * explícita del usuario), NO versiona: `update()` edita en el lugar
 * (`Percentaje`/`IndMain`/vigencia) sobre la misma fila en vez de crear
 * una nueva, y `NumMovement` queda fijo en `1` -- si en cambio se
 * permitiera dejar dos filas Activas para el mismo (producto, canal
 * origen, canal destino) a la vez, `setContractDistributionChannel` las
 * tomaría a ambas y duplicaría el split en el contrato. Cambiar
 * `codProduct`/`codDistributionChannelOrigin`/`codDistributionChannelDestiny`
 * no está permitido en `update()` por la misma razón que en `SCommission`
 * (mueve la identidad de la fila) -- para eso se crea una fila nueva, con
 * cuidado de dejar `Inactivo` (o borrar) la que reemplaza.
 */
@Injectable()
export class CommissionProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async findAll(query: ListCommissionProductsDto): Promise<SCommissionProduct[]> {
    // `IdeDistributionChannelOrigin`/`IdeDistributionChannelDestiny` son
    // uuid crudo sin relación declarada hacia `SDistributionChannel` en el
    // esquema introspectado (a diferencia de `SProduct`) -- se resuelve el
    // código a id acá en vez de filtrar por relación.
    const where: Prisma.SCommissionProductWhereInput = {};
    if (query.codProduct) {
      where.SProduct = { CodProduct: query.codProduct };
    }
    if (query.codDistributionChannelOrigin) {
      where.IdeDistributionChannelOrigin = await this.resolveDistributionChannel(
        query.codDistributionChannelOrigin,
      );
    }
    return this.prisma.sCommissionProduct.findMany({
      where,
      include: INCLUDE,
      orderBy: { TstCreation: 'desc' },
    });
  }

  async findOne(id: string): Promise<SCommissionProduct> {
    const row = await this.prisma.sCommissionProduct.findUnique({
      where: { IdeCommissionProduct: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe configuración de split de comisión con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateCommissionProductDto, actor: string): Promise<SCommissionProduct> {
    const ideProduct = await this.resolveProduct(dto.codProduct);
    const ideOrigin = await this.resolveDistributionChannel(dto.codDistributionChannelOrigin);
    const ideDestiny = await this.resolveDistributionChannel(dto.codDistributionChannelDestiny);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');

    const now = new Date();
    return this.prisma.sCommissionProduct.create({
      data: {
        IdeProduct: ideProduct,
        IdeDistributionChannelOrigin: ideOrigin,
        IdeDistributionChannelDestiny: ideDestiny,
        Percentaje: dto.percentaje,
        IndMain: dto.indMain,
        TstInitial: new Date(dto.tstInitial),
        TstEnd: new Date(dto.tstEnd),
        NumMovement: 1,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateCommissionProductDto, actor: string): Promise<SCommissionProduct> {
    await this.findOne(id);
    const data: Prisma.SCommissionProductUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.percentaje !== undefined) data.Percentaje = dto.percentaje;
    if (dto.indMain !== undefined) data.IndMain = dto.indMain;
    if (dto.tstInitial !== undefined) data.TstInitial = new Date(dto.tstInitial);
    if (dto.tstEnd !== undefined) data.TstEnd = new Date(dto.tstEnd);

    return this.prisma.sCommissionProduct.update({ where: { IdeCommissionProduct: id }, data, include: INCLUDE });
  }

  async setState(id: string, codState: string, actor: string): Promise<SCommissionProduct> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sCommissionProduct.update({
      where: { IdeCommissionProduct: id },
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

  private async resolveDistributionChannel(codDistributionChannel: string): Promise<string> {
    const channel = await this.prisma.sDistributionChannel.findFirst({
      where: { CodDistributionChannel: codDistributionChannel },
    });
    if (!channel) {
      throw new NotFoundException(`No existe canal de distribución con código "${codDistributionChannel}"`);
    }
    return channel.IdeDistributionChannel;
  }
}
