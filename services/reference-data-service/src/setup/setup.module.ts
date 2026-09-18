import { Module } from '@nestjs/common';
import { ReferenceDataStateMachineModule } from '../state-machine/reference-data-state-machine.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationRolesController } from './application-roles.controller';
import { ApplicationRolesService } from './application-roles.service';
import { SiteMapController } from './site-map.controller';
import { SiteMapService } from './site-map.service';
import { SiteMapMenuController } from './site-map-menu.controller';
import { SiteMapMenuService } from './site-map-menu.service';
import { SiteMapRolesController } from './site-map-roles.controller';
import { SiteMapRolesService } from './site-map-roles.service';

/**
 * Segunda parte del alcance de `reference-data-service` (ver su
 * README): configuración del árbol de navegación -- `SApplication`
 * (apps que consumen el menú), `SApplicationRole` (roles por app),
 * `SSiteMap` (ítems de menú, jerárquico), `SSiteMapRole` (concesión de
 * acceso rol→ítem), y el endpoint real de árbol (`SiteMapMenuService`,
 * equivalente a `FGetSiteMap` -- ver ese archivo para el detalle del
 * algoritmo confirmado y la deduplicación explícita, decisión del
 * usuario, ver docs/02-roadmap.md).
 */
@Module({
  imports: [ReferenceDataStateMachineModule],
  controllers: [
    ApplicationsController,
    ApplicationRolesController,
    SiteMapController,
    SiteMapMenuController,
    SiteMapRolesController,
  ],
  providers: [
    ApplicationsService,
    ApplicationRolesService,
    SiteMapService,
    SiteMapMenuService,
    SiteMapRolesService,
  ],
})
export class SetupModule {}
