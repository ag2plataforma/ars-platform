import { Injectable } from '@nestjs/common';
import { PrismaService, SChannelType } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateChannelTypeDto } from './dto/create-channel-type.dto';
import { UpdateChannelTypeDto } from './dto/update-channel-type.dto';

@Injectable()
export class ChannelTypesService {
  private readonly crud: CatalogCrudService<SChannelType>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SChannelType>(
      prisma.sChannelType,
      'CodChannelType',
      'DesChannelType',
      'IdeChannelType',
      'tipo de canal',
      { SState: true },
    );
  }

  findAll(): Promise<SChannelType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SChannelType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateChannelTypeDto, actor: string): Promise<SChannelType> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codChannelType, dto.desChannelType, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateChannelTypeDto, actor: string): Promise<SChannelType> {
    return this.crud.update(id, dto.desChannelType, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SChannelType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
