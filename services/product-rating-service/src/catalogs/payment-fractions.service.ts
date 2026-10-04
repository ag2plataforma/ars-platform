import { Injectable } from '@nestjs/common';
import { PrismaService, SPaymentFraction } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreatePaymentFractionDto } from './dto/create-payment-fraction.dto';
import { UpdatePaymentFractionDto } from './dto/update-payment-fraction.dto';

/**
 * `SPaymentFraction` -- catálogo de formas de fraccionar el pago de una
 * póliza (Anual=1, Semestral=2, Trimestral=4, Mensual=12...). A qué
 * productos se ofrece cada una (con su recargo y vigencia) se configura
 * aparte en `SProductPaymentFraction` (`ProductPaymentFractionsService`).
 */
@Injectable()
export class PaymentFractionsService {
  private readonly crud: CatalogCrudService<SPaymentFraction>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SPaymentFraction>(
      prisma.sPaymentFraction,
      'CodPaymentFraction',
      'DesPaymentFraction',
      'IdePaymentFraction',
      'fracción de pago',
      { SState: true },
    );
  }

  async findAll(): Promise<SPaymentFraction[]> {
    const rows = await this.crud.findAll();
    return rows.sort((a, b) => a.NumOrder - b.NumOrder);
  }

  findOne(id: string): Promise<SPaymentFraction> {
    return this.crud.findOne(id);
  }

  async create(dto: CreatePaymentFractionDto, actor: string): Promise<SPaymentFraction> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codPaymentFraction,
      dto.desPaymentFraction,
      { NumFraction: dto.numFraction, NumOrder: dto.numOrder },
      activeStateId,
      actor,
    );
  }

  update(id: string, dto: UpdatePaymentFractionDto, actor: string): Promise<SPaymentFraction> {
    const extra: Record<string, unknown> = {};
    if (dto.numFraction !== undefined) extra.NumFraction = dto.numFraction;
    if (dto.numOrder !== undefined) extra.NumOrder = dto.numOrder;
    return this.crud.update(id, dto.desPaymentFraction, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SPaymentFraction> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
