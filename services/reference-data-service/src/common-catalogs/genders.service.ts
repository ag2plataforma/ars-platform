import { Injectable } from '@nestjs/common';
import { PrismaService, SGender } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateGenderDto } from './dto/create-gender.dto';
import { UpdateGenderDto } from './dto/update-gender.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia) -- mismo patrón `CatalogCrudService` que los 8 catálogos
 * simples de `product-rating-service` (ver `docs/02-roadmap.md`).
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class GendersService {
  private readonly crud: CatalogCrudService<SGender>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SGender>(
      prisma.sGender,
      'CodGender',
      'DesGender',
      'IdeGender',
      'género',
      INCLUDE,
    );
  }

  findAll(): Promise<SGender[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SGender> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateGenderDto, actor: string): Promise<SGender> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codGender, dto.desGender, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateGenderDto, actor: string): Promise<SGender> {
    return this.crud.update(id, dto.desGender, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SGender> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
