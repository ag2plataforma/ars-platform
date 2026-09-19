import { Injectable } from '@nestjs/common';
import { PrismaService, SLanguage } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateLanguageDto } from './dto/create-language.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia) -- mismo patrón `CatalogCrudService` que los 8 catálogos
 * simples de `product-rating-service` (ver `docs/02-roadmap.md`).
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class LanguagesService {
  private readonly crud: CatalogCrudService<SLanguage>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SLanguage>(
      prisma.sLanguage,
      'CodLanguage',
      'DesLanguage',
      'IdeLanguage',
      'idioma',
      INCLUDE,
    );
  }

  findAll(): Promise<SLanguage[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SLanguage> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateLanguageDto, actor: string): Promise<SLanguage> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codLanguage, dto.desLanguage, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateLanguageDto, actor: string): Promise<SLanguage> {
    return this.crud.update(id, dto.desLanguage, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SLanguage> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
