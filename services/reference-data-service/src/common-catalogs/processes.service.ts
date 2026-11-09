import { Injectable } from '@nestjs/common';
import { PrismaService, SProcess } from '@ars-platform/database';
import { StateMachineService, CatalogCrudService } from '@ars-platform/shared-common';
import { CreateProcessDto } from './dto/create-process.dto';
import { UpdateProcessDto } from './dto/update-process.dto';

/**
 * `SProcess` -- catálogo maestro de procesos operativos (ej. "Contratación de póliza"): lo usan las comisiones
 * (`SCommission.IdeProcess`), los requisitos por producto (`SProductRequirement`) y las operaciones por producto
 * (`SOperationProduct`). Hasta 2026-11-09 solo tenía un GET de lectura en `party-service`; sin pantalla de
 * mantenimiento no se podían crear procesos nuevos. Mismo patrón que `OperationsService`.
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class ProcessesService {
  private readonly crud: CatalogCrudService<SProcess>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SProcess>(
      prisma.sProcess,
      'CodProcess',
      'DesProcess',
      'IdeProcess',
      'proceso',
      INCLUDE,
    );
  }

  findAll(): Promise<SProcess[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SProcess> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateProcessDto, actor: string): Promise<SProcess> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codProcess, dto.desProcess, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateProcessDto, actor: string): Promise<SProcess> {
    return this.crud.update(id, dto.desProcess, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SProcess> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
