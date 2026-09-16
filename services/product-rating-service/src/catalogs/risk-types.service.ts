import { Injectable } from '@nestjs/common';
import { PrismaService, SRiskType } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from './catalog-crud.service';
import { CreateRiskTypeDto } from './dto/create-risk-type.dto';
import { UpdateRiskTypeDto } from './dto/update-risk-type.dto';

@Injectable()
export class RiskTypesService {
  private readonly crud: CatalogCrudService<SRiskType>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SRiskType>(
      prisma.sRiskType,
      'CodRiskType',
      'DesRiskType',
      'IdeRiskType',
      'tipo de riesgo',
    );
  }

  findAll(): Promise<SRiskType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SRiskType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateRiskTypeDto, actor: string): Promise<SRiskType> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codRiskType, dto.desRiskType, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateRiskTypeDto, actor: string): Promise<SRiskType> {
    return this.crud.update(id, dto.desRiskType, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SRiskType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
