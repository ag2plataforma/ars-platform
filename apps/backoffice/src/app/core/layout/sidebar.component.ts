import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { SiteMapService, MenuNode } from './site-map.service';
import { SidebarNavItemComponent } from './sidebar-nav-item.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, SidebarNavItemComponent],
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
