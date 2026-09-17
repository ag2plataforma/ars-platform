import { Injectable } from '@nestjs/common';
import { PrismaService, SStep } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';

/**
 * `SStep` -- catálogo simple: un paso posible dentro de cualquier flujo
 * (ej. "datos-personales", "cotizacion"). `SFlowStep` lo referencia dos
 * veces (paso actual / paso siguiente) -- ver `../flow-steps/`.
 */
@Injectable()
export class StepsService {
  private readonly crud: CatalogCrudService<SStep>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SStep>(
      this.prisma.sStep,
      'CodStep',
      'DesStep',
      'IdeStep',
      'paso',
    );
  }

  findAll(): Promise<SStep[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SStep> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateStepDto, actor: string): Promise<SStep> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codStep, dto.desStep, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateStepDto, actor: string): Promise<SStep> {
    return this.crud.update(id, dto.desStep, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SStep> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
