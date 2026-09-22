import { Injectable } from '@nestjs/common';
import { PrismaService, SApplication } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

const INCLUDE = { SState: true } as const;

@Injectable()
export class ApplicationsService {
  private readonly crud: CatalogCrudService<SApplication>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SApplication>(
      prisma.sApplication,
      'CodApplication',
      'DesApplication',
      'IdeApplication',
      'aplicación',
      INCLUDE,
    );
  }

  findAll(): Promise<SApplication[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SApplication> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateApplicationDto, actor: string): Promise<SApplication> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codApplication, dto.desApplication, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateApplicationDto, actor: string): Promise<SApplication> {
    return this.crud.update(id, dto.desApplication, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SApplication> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
