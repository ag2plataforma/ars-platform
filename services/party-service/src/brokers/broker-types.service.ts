import { Injectable } from '@nestjs/common';
import { PrismaService, SBrokerType } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateBrokerTypeDto } from './dto/create-broker-type.dto';
import { UpdateBrokerTypeDto } from './dto/update-broker-type.dto';

/**
 * `SBrokerType` -- catálogo de tipos de corredor, hasta ahora "asumido
 * ya sembrado" (ver el comentario original de `brokers.service.ts`) sin
 * ningún CRUD ni endpoint de listado en ningún servicio. Se agrega acá,
 * junto a `TBroker`, siguiendo el mismo criterio ya usado para
 * `SChannelType`/`SDistributionWay` en `distribution.module.ts` (otro
 * catálogo que estaba en la misma situación): hace falta un selector
 * real para la pantalla de Corredores del backoffice.
 */
@Injectable()
export class BrokerTypesService {
  private readonly crud: CatalogCrudService<SBrokerType>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SBrokerType>(
      prisma.sBrokerType,
      'CodBrokerType',
      'DesBrokerType',
      'IdeBrokerType',
      'tipo de corredor',
      { SState: true },
    );
  }

  findAll(): Promise<SBrokerType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SBrokerType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateBrokerTypeDto, actor: string): Promise<SBrokerType> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codBrokerType, dto.desBrokerType, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateBrokerTypeDto, actor: string): Promise<SBrokerType> {
    return this.crud.update(id, dto.desBrokerType, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SBrokerType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
