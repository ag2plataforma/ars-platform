import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SSiteMap } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateSiteMapDto } from './dto/create-site-map.dto';
import { UpdateSiteMapDto } from './dto/update-site-map.dto';

const INCLUDE = { SState: true } as const;

/**
 * `SSiteMap` -- ítems del árbol de navegación. `CodSiteMap` sí es único
 * global (`UK_SSiteMap_01`, a diferencia de `SLocation`), así que
 * reutiliza `CatalogCrudService` con jerarquía propia, mismo patrón que
 * `SRiskLevel` (`codSiteMapParent` -- '' desasocia, un código real
 * resuelve, no enviado deja el campo intacto). El árbol de MENÚ real
 * (equivalente a `FGetSiteMap`) se sirve desde `SiteMapMenuService`, no
 * desde acá -- esto es solo el CRUD de los ítems.
 */
@Injectable()
export class SiteMapService {
  private readonly crud: CatalogCrudService<SSiteMap>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SSiteMap>(
      this.prisma.sSiteMap,
      'CodSiteMap',
      'DesSiteMap',
      'IdeSiteMap',
      'ítem de menú',
      INCLUDE,
    );
  }

  findAll(): Promise<SSiteMap[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SSiteMap> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateSiteMapDto, actor: string): Promise<SSiteMap> {
    const extra = await this.buildExtra(dto);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codSiteMap, dto.desSiteMap, extra, activeStateId, actor);
  }

  async update(id: string, dto: UpdateSiteMapDto, actor: string): Promise<SSiteMap> {
    const extra = await this.buildExtra(dto);
    return this.crud.update(id, dto.desSiteMap, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SSiteMap> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async buildExtra(dto: CreateSiteMapDto | UpdateSiteMapDto): Promise<Record<string, unknown>> {
    const extra: Record<string, unknown> = {};
    if (dto.numOrder !== undefined) extra.NumOrder = dto.numOrder;
    if (dto.desPathOption !== undefined) extra.DesPathOption = dto.desPathOption;
    if (dto.image !== undefined) extra.Image = dto.image;
    if (dto.codSiteMapParent !== undefined) {
      if (dto.codSiteMapParent === '') {
        extra.IdeSiteMapParent = null;
      } else {
        const parent = await this.prisma.sSiteMap.findFirst({ where: { CodSiteMap: dto.codSiteMapParent } });
        if (!parent) {
          throw new NotFoundException(`No existe ítem de menú padre con código "${dto.codSiteMapParent}"`);
        }
        extra.IdeSiteMapParent = parent.IdeSiteMap;
      }
    }
    return extra;
  }
}
