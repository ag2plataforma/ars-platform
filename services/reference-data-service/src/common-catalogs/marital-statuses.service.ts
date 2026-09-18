import { Injectable } from '@nestjs/common';
import { PrismaService, SMaritalStatus } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateMaritalStatusDto } from './dto/create-marital-status.dto';
import { UpdateMaritalStatusDto } from './dto/update-marital-status.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia) -- mismo patrón `CatalogCrudService` que los 8 catálogos
 * simples de `product-rating-service` (ver `docs/02-roadmap.md`).
 */
@Injectable()
export class MaritalStatusesService {
  private readonly crud: CatalogCrudService<SMaritalStatus>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SMaritalStatus>(
      prisma.sMaritalStatus,
      'CodMaritalStatus',
      'DesMaritalStatus',
      'IdeMaritalStatus',
      'estado civil',
    );
  }

  findAll(): Promise<SMaritalStatus[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SMaritalStatus> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateMaritalStatusDto, actor: string): Promise<SMaritalStatus> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codMaritalStatus, dto.desMaritalStatus, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateMaritalStatusDto, actor: string): Promise<SMaritalStatus> {
    return this.crud.update(id, dto.desMaritalStatus, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SMaritalStatus> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
