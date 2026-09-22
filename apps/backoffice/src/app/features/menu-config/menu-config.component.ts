import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabsModule } from 'primeng/tabs';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApplicationsTabComponent } from './applications-tab.component';
import { ApplicationRolesTabComponent } from './application-roles-tab.component';
import { SiteMapTabComponent } from './site-map-tab.component';
import { SiteMapRolesTabComponent } from './site-map-roles-tab.component';

/**
 * "Configuración de menú" (`SetupModule`): una sola página con 4
 * pestañas -- `SApplication`, `SApplicationRole`, `SSiteMap` y
 * `SSiteMapRole` -- en vez de 4 rutas separadas, porque las entidades
 * están fuertemente relacionadas entre sí (un rol pertenece a una app,
 * un permiso conecta un rol con un ítem de menú). Decisión explícita del
 * usuario, ver `docs/02-roadmap.md`.
 *
 * Una vez cargados datos reales acá, el menú lateral dinámico (que
 * consume `GET /reference-data/site-map-menu`, ver `sidebar.component.ts`)
 * empieza a mostrar secciones de verdad en vez del mensaje de "todavía
 * no hay más secciones configuradas".
 */
@Component({
  selector: 'app-menu-config',
  standalone: true,
  imports: [
    CommonModule,
    TabsModule,
    ApplicationsTabComponent,
    ApplicationRolesTabComponent,
    SiteMapTabComponent,
    SiteMapRolesTabComponent,
    TranslocoPipe,
  ],
  templateUrl: './menu-config.component.html',
})
export class MenuConfigComponent {
  readonly activeTab = signal<string | number>('applications');
}
