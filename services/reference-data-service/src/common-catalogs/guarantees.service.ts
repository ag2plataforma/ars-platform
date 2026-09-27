import { Injectable } from '@nestjs/common';
import { PrismaService, SGuarantee } from '@ars-platform/database';
import { StateMachineService, CatalogCrudService } from '@ars-platform/shared-common';
import { CreateGuaranteeDto } from './dto/create-guarantee.dto';
import { UpdateGuaranteeDto } from './dto/update-guarantee.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia), mismo patrón que `PaymentTypesService`. Agregado 2026-09-27
 * (cierre del pendiente chico de Siniestros Etapa 2, ver
 * `docs/02-roadmap.md`) -- `SGuarantee` ya existía en el esquema legado
 * (`SCoverageGuarantee.IdeGuarantee` la usa desde Etapa 1) pero no tenía
 * ningún CRUD/listado expuesto todavía; la pantalla de configuración de
 * garantías por cobertura (`CoverageGuaranteesTabComponent`, en
 * `product-rating-service`) necesita poder elegir una garantía real.
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class GuaranteesService {
  private readonly crud: CatalogCrudService<SGuarantee>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SGuarantee>(
      prisma.sGuarantee,
      'CodGuarantee',
      'DesGuarantee',
      'IdeGuarantee',
      'garantía',
      INCLUDE,
    );
  }

  findAll(): Promise<SGuarantee[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SGuarantee> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateGuaranteeDto, actor: string): Promise<SGuarantee> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codGuarantee, dto.desGuarantee, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateGuaranteeDto, actor: string): Promise<SGuarantee> {
    return this.crud.update(id, dto.desGuarantee, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SGuarantee> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
