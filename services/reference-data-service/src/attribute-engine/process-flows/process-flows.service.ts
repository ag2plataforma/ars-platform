import { Injectable } from '@nestjs/common';
import { PrismaService, SProcessFlow } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateProcessFlowDto } from './dto/create-process-flow.dto';
import { UpdateProcessFlowDto } from './dto/update-process-flow.dto';

/**
 * `SProcessFlow` -- catálogo simple: el flujo al que pertenece un
 * conjunto de `SFlowStep` (ej. "Cotización auto", "Alta de mascota").
 * Prerrequisito de `../flow-steps/`.
 */
@Injectable()
export class ProcessFlowsService {
  private readonly crud: CatalogCrudService<SProcessFlow>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SProcessFlow>(
      this.prisma.sProcessFlow,
      'CodProcessFlow',
      'DesProcessFlow',
      'IdeProcessFlow',
      'flujo de proceso',
      { SState: true },
    );
  }

  findAll(): Promise<SProcessFlow[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SProcessFlow> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateProcessFlowDto, actor: string): Promise<SProcessFlow> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codProcessFlow, dto.desProcessFlow, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateProcessFlowDto, actor: string): Promise<SProcessFlow> {
    return this.crud.update(id, dto.desProcessFlow, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SProcessFlow> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
