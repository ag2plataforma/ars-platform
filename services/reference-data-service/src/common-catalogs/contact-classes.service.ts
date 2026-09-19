import { Injectable } from '@nestjs/common';
import { PrismaService, SContactClass } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateContactClassDto } from './dto/create-contact-class.dto';
import { UpdateContactClassDto } from './dto/update-contact-class.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia) -- mismo patrón `CatalogCrudService` que los 8 catálogos
 * simples de `product-rating-service` (ver `docs/02-roadmap.md`).
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class ContactClassesService {
  private readonly crud: CatalogCrudService<SContactClass>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SContactClass>(
      prisma.sContactClass,
      'CodContactClass',
      'DesContactClass',
      'IdeContactClass',
      'clase de contacto',
      INCLUDE,
    );
  }

  findAll(): Promise<SContactClass[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SContactClass> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateContactClassDto, actor: string): Promise<SContactClass> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codContactClass, dto.desContactClass, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateContactClassDto, actor: string): Promise<SContactClass> {
    return this.crud.update(id, dto.desContactClass, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SContactClass> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
