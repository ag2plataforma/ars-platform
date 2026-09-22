import { Injectable } from '@nestjs/common';
import { PrismaService, SDistributionWay } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateDistributionWayDto } from './dto/create-distribution-way.dto';
import { UpdateDistributionWayDto } from './dto/update-distribution-way.dto';

@Injectable()
export class DistributionWaysService {
  private readonly crud: CatalogCrudService<SDistributionWay>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SDistributionWay>(
      prisma.sDistributionWay,
      'CodDistributionWay',
      'DesDistributionWay',
      'IdeDistributionWay',
      'vía de distribución',
      { SState: true },
    );
  }

  findAll(): Promise<SDistributionWay[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SDistributionWay> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateDistributionWayDto, actor: string): Promise<SDistributionWay> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codDistributionWay, dto.desDistributionWay, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateDistributionWayDto, actor: string): Promise<SDistributionWay> {
    return this.crud.update(id, dto.desDistributionWay, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SDistributionWay> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
