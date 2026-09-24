import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SClaimEvent } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateClaimEventDto } from './dto/create-claim-event.dto';
import { UpdateClaimEventDto } from './dto/update-claim-event.dto';

const INCLUDE = { SClaimType: true, SState: true } as const;

/**
 * `SClaimEvent` -- catálogo de eventos concretos dentro de un tipo de
 * siniestro (ej. tipo "Daños materiales" -> eventos "Incendio"/"Robo"/
 * "Inundación"). Mismo criterio que `ClaimTypesService`
 * (`CatalogCrudService` + resolución de FK por código) -- ver su
 * doc-comment para el análisis completo de la Fase 4 (Siniestros).
 *
 * `IdeClaimType` es la única FK y es obligatoria -- no hay alcance
 * "comodín NULL" acá, cada evento pertenece a exactamente un tipo.
 */
@Injectable()
export class ClaimEventsService {
  private readonly crud: CatalogCrudService<SClaimEvent>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SClaimEvent>(
      this.prisma.sClaimEvent,
      'CodClaimEvent',
      'DesClaimEvent',
      'IdeClaimEvent',
      'evento de siniestro',
      INCLUDE,
    );
  }

  findAll(codClaimType?: string): Promise<SClaimEvent[]> {
    if (!codClaimType) return this.crud.findAll();
    return this.prisma.sClaimEvent.findMany({
      where: { SClaimType: { CodClaimType: codClaimType } },
      include: INCLUDE,
      orderBy: { DesClaimEvent: 'asc' },
    });
  }

  findOne(id: string): Promise<SClaimEvent> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateClaimEventDto, actor: string): Promise<SClaimEvent> {
    const ideClaimType = await this.resolveClaimType(dto.codClaimType);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codClaimEvent,
      dto.desClaimEvent,
      { IdeClaimType: ideClaimType, DesShort: dto.desShort, DesLarge: dto.desLarge, Order: dto.order },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateClaimEventDto, actor: string): Promise<SClaimEvent> {
    const extra: Record<string, unknown> = {};
    if (dto.codClaimType !== undefined) extra.IdeClaimType = await this.resolveClaimType(dto.codClaimType);
    if (dto.desShort !== undefined) extra.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) extra.DesLarge = dto.desLarge;
    if (dto.order !== undefined) extra.Order = dto.order;
    return this.crud.update(id, dto.desClaimEvent, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SClaimEvent> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveClaimType(codClaimType: string): Promise<string> {
    const row = await this.prisma.sClaimType.findFirst({ where: { CodClaimType: codClaimType } });
    if (!row) throw new NotFoundException(`No existe tipo de siniestro con código "${codClaimType}"`);
    return row.IdeClaimType;
  }
}
