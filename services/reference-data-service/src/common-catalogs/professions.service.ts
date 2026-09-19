import { Injectable } from '@nestjs/common';
import { PrismaService, SProfession } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateProfessionDto } from './dto/create-profession.dto';
import { UpdateProfessionDto } from './dto/update-profession.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia) -- mismo patrón `CatalogCrudService` que los 8 catálogos
 * simples de `product-rating-service` (ver `docs/02-roadmap.md`).
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class ProfessionsService {
  private readonly crud: CatalogCrudService<SProfession>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SProfession>(
      prisma.sProfession,
      'CodProfession',
      'DesProfession',
      'IdeProfession',
      'profesión',
      INCLUDE,
    );
  }

  findAll(): Promise<SProfession[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SProfession> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateProfessionDto, actor: string): Promise<SProfession> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codProfession, dto.desProfession, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateProfessionDto, actor: string): Promise<SProfession> {
    return this.crud.update(id, dto.desProfession, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SProfession> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
