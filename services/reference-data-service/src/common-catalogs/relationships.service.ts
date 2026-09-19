import { Injectable } from '@nestjs/common';
import { PrismaService, SRelationship } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateRelationshipDto } from './dto/create-relationship.dto';
import { UpdateRelationshipDto } from './dto/update-relationship.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia) -- mismo patrón `CatalogCrudService` que los 8 catálogos
 * simples de `product-rating-service` (ver `docs/02-roadmap.md`).
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class RelationshipsService {
  private readonly crud: CatalogCrudService<SRelationship>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SRelationship>(
      prisma.sRelationship,
      'CodRelationship',
      'DesRelationship',
      'IdeRelationship',
      'parentesco',
      INCLUDE,
    );
  }

  findAll(): Promise<SRelationship[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SRelationship> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateRelationshipDto, actor: string): Promise<SRelationship> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codRelationship, dto.desRelationship, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateRelationshipDto, actor: string): Promise<SRelationship> {
    return this.crud.update(id, dto.desRelationship, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SRelationship> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
