import { Injectable } from '@nestjs/common';
import { PrismaService, SIdentificationType } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateIdentificationTypeDto } from './dto/create-identification-type.dto';
import { UpdateIdentificationTypeDto } from './dto/update-identification-type.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia) -- mismo patrón `CatalogCrudService` que los 8 catálogos
 * simples de `product-rating-service` (ver `docs/02-roadmap.md`).
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class IdentificationTypesService {
  private readonly crud: CatalogCrudService<SIdentificationType>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SIdentificationType>(
      prisma.sIdentificationType,
      'CodIdentificationType',
      'DesIdentificationType',
      'IdeIdentificationType',
      'tipo de identificación',
      INCLUDE,
    );
  }

  findAll(): Promise<SIdentificationType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SIdentificationType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateIdentificationTypeDto, actor: string): Promise<SIdentificationType> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codIdentificationType, dto.desIdentificationType, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateIdentificationTypeDto, actor: string): Promise<SIdentificationType> {
    return this.crud.update(id, dto.desIdentificationType, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SIdentificationType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
