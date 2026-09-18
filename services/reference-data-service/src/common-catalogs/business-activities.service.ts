import { Injectable } from '@nestjs/common';
import { PrismaService, SBusinessActivity } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateBusinessActivityDto } from './dto/create-business-activity.dto';
import { UpdateBusinessActivityDto } from './dto/update-business-activity.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia) -- mismo patrón `CatalogCrudService` que los 8 catálogos
 * simples de `product-rating-service` (ver `docs/02-roadmap.md`).
 */
@Injectable()
export class BusinessActivitiesService {
  private readonly crud: CatalogCrudService<SBusinessActivity>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SBusinessActivity>(
      prisma.sBusinessActivity,
      'CodBusinessActivity',
      'DesBusinessActivity',
      'IdeBusinessActivity',
      'actividad económica',
    );
  }

  findAll(): Promise<SBusinessActivity[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SBusinessActivity> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateBusinessActivityDto, actor: string): Promise<SBusinessActivity> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codBusinessActivity, dto.desBusinessActivity, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateBusinessActivityDto, actor: string): Promise<SBusinessActivity> {
    return this.crud.update(id, dto.desBusinessActivity, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SBusinessActivity> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
