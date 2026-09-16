import { Injectable } from '@nestjs/common';
import { PrismaService, SLimitType } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from './catalog-crud.service';
import { CreateLimitTypeDto } from './dto/create-limit-type.dto';
import { UpdateLimitTypeDto } from './dto/update-limit-type.dto';

@Injectable()
export class LimitTypesService {
  private readonly crud: CatalogCrudService<SLimitType>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SLimitType>(
      prisma.sLimitType,
      'CodLimitType',
      'DesLimitType',
      'IdeLimitType',
      'tipo de límite',
    );
  }

  findAll(): Promise<SLimitType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SLimitType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateLimitTypeDto, actor: string): Promise<SLimitType> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codLimitType, dto.desLimitType, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateLimitTypeDto, actor: string): Promise<SLimitType> {
    return this.crud.update(id, dto.desLimitType, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SLimitType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
