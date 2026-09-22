import { Component, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { SiteMapService, MenuNode } from './site-map.service';
import { SidebarNavItemComponent } from './sidebar-nav-item.component';
import { TranslocoPipe } from '@jsverse/transloco';

/** El sidebar es 100% dinámico, armado desde `GET /site-map-menu`
 * (`SApplication`/`SApplicationRole`/`SSiteMap`/`SSiteMapRole`, ver
 * "Configuración de menú") -- ya no tiene links fijos hardcodeados acá,
 * decisión explícita del usuario (antes tenía 4 links fijos + esta
 * sección dinámica aparte, lo que iba a duplicar entradas apenas se
 * cargaran esas mismas pantallas en `SSiteMap`). Ver
 * `packages/database/scripts/seed-menu-config.js` para poblar las 4
 * pantallas base. */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [SidebarNavItemComponent, TranslocoPipe],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  readonly items = signal<MenuNode[]>([]);
  readonly loading = signal(true);

  constructor(
    private readonly siteMap: SiteMapService,
    private readonly auth: AuthService,
  ) {
    const role = this.auth.payload()?.role;
    if (!role) {
      this.loading.set(false);
      return;
    }
    this.siteMap.getMenu(role).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
