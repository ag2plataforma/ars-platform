import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SSiteMapRole } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateSiteMapRoleDto } from './dto/create-site-map-role.dto';
import { ListSiteMapRolesDto } from './dto/list-site-map-roles.dto';

const INCLUDE = { SSiteMap: true, SApplicationRole: true, SState: true } as const;

/**
 * `SSiteMapRole` -- tabla puente que otorga a un rol de aplicación
 * (`SApplicationRole`) acceso a un ítem de menú (`SSiteMap`). Es la
 * tabla que consume `FGetSiteMap`/`SiteMapMenuService` para filtrar el
 * árbol por rol. Única real por (`IdeSiteMap`, `IdeApplicationRole`) --
 * `UK_SSiteMapRole_01` -- se chequea antes de insertar, mismo criterio
 * que `TranslationsService` con `STranslator`. Sin `update`: es una
 * concesión de acceso, se otorga o se retira (`setState`), no se edita.
 */
@Injectable()
export class SiteMapRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async findAll(query: ListSiteMapRolesDto): Promise<SSiteMapRole[]> {
    const where: Prisma.SSiteMapRoleWhereInput = {};
    if (query.codSiteMap) where.SSiteMap = { CodSiteMap: query.codSiteMap };
    if (query.codApplicationRole) where.SApplicationRole = { CodApplicationRole: query.codApplicationRole };
    return this.prisma.sSiteMapRole.findMany({ where, include: INCLUDE, orderBy: { TstCreation: 'asc' } });
  }

  async findOne(id: string): Promise<SSiteMapRole> {
    const row = await this.prisma.sSiteMapRole.findUnique({ where: { IdeSiteMapRole: id }, include: INCLUDE });
    if (!row) {
      throw new NotFoundException(`No existe concesión de menú con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateSiteMapRoleDto, actor: string): Promise<SSiteMapRole> {
    const siteMap = await this.prisma.sSiteMap.findFirst({ where: { CodSiteMap: dto.codSiteMap } });
    if (!siteMap) {
      throw new NotFoundException(`No existe ítem de menú con código "${dto.codSiteMap}"`);
    }
    const applicationRole = await this.prisma.sApplicationRole.findFirst({
      where: { CodApplicationRole: dto.codApplicationRole },
    });
    if (!applicationRole) {
      throw new NotFoundException(`No existe rol de aplicación con código "${dto.codApplicationRole}"`);
    }
    const existing = await this.prisma.sSiteMapRole.findFirst({
      where: { IdeSiteMap: siteMap.IdeSiteMap, IdeApplicationRole: applicationRole.IdeApplicationRole },
    });
    if (existing) {
      throw new ConflictException('Ese rol ya tiene acceso concedido a ese ítem de menú');
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sSiteMapRole.create({
      data: {
        IdeSiteMap: siteMap.IdeSiteMap,
        IdeApplicationRole: applicationRole.IdeApplicationRole,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async setState(id: string, codState: string, actor: string): Promise<SSiteMapRole> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sSiteMapRole.update({
      where: { IdeSiteMapRole: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }
}
