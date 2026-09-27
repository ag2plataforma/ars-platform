import { Injectable } from '@nestjs/common';
import { PrismaService, SPaymentType } from '@ars-platform/database';
import { StateMachineService, CatalogCrudService } from '@ars-platform/shared-common';
import { CreatePaymentTypeDto } from './dto/create-payment-type.dto';
import { UpdatePaymentTypeDto } from './dto/update-payment-type.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia), mismo patrón que `GendersService`. Agregado 2026-09-24 (Fase
 * 4, Etapa 2) -- `SPaymentType` ya existía en el esquema legado
 * (`TApproval.IdePaymentType` la usa desde Etapa 1) pero no tenía
 * ningún CRUD/listado expuesto todavía; la pantalla de aprobación de
 * siniestros necesita poder elegir un tipo de pago real.
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class PaymentTypesService {
  private readonly crud: CatalogCrudService<SPaymentType>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SPaymentType>(
      prisma.sPaymentType,
      'CodPaymentType',
      'DesPaymentType',
      'IdePaymentType',
      'tipo de pago',
      INCLUDE,
    );
  }

  findAll(): Promise<SPaymentType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SPaymentType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreatePaymentTypeDto, actor: string): Promise<SPaymentType> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codPaymentType, dto.desPaymentType, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdatePaymentTypeDto, actor: string): Promise<SPaymentType> {
    return this.crud.update(id, dto.desPaymentType, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SPaymentType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
