import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const SITE_MAP_PATH = '/reference-data/site-map';
const SITE_MAP_ROLES_PATH = '/reference-data/site-map-roles';
const APPLICATION_ROLES_PATH = '/reference-data/application-roles';

interface RoleOption {
  code: string;
  label: string;
}

interface MatrixRow {
  siteMap: CatalogRow;
  level: number;
  granted: boolean;
  grantId: string | null;
}

/**
 * `SSiteMapRole` -- concesión de acceso de un rol de aplicación a un
 * ítem de menú. Confirmado en `site-map-roles.service.ts`: no tiene
 * `update`, solo `create` (nace en `ACTIVO`) y `PATCH /:id/state`
 * (otorgar/revocar) -- "se otorga o se retira, no se edita". Se
 * representa acá como una matriz: se elige un rol y se listan todos los
 * ítems de menú con un checkbox on/off por fila (decisión explícita del
 * usuario sobre cómo armar esta pantalla).
 */
@Component({
  selector: 'app-site-map-roles-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, TableModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  templateUrl: './site-map-roles-tab.component.html',
})
export class SiteMapRolesTabComponent {
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  private readonly applicationRoles = signal<CatalogRow[]>([]);
  private allSiteMaps: CatalogRow[] = [];

  readonly selectedRole = signal<string>('');
  readonly matrix = signal<MatrixRow[]>([]);
  readonly loading = signal(false);

  readonly roleOptions = computed<RoleOption[]>(() =>
    this.applicationRoles().map((row) => ({
      code: String(row['CodApplicationRole']),
      label: this.roleLabel(row),
    })),
  );

  constructor() {
    this.loadApplicationRoles();
  }

  /** Roles de aplicación para el selector de arriba. Público (no
   * `private`) porque también se re-consulta desde el template al abrir
   * el desplegable (`(onShow)`): las 4 pestañas de `MenuConfigComponent`
   * se montan todas juntas, así que si el usuario crea un rol nuevo en
   * la pestaña de Roles y vuelve acá sin recargar la página, la lista
   * cacheada en el `constructor` quedaría desactualizada. */
  loadApplicationRoles(): void {
    this.catalogService.list(APPLICATION_ROLES_PATH).subscribe({
      next: (rows) => this.applicationRoles.set(rows),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('menuConfig.siteMapRoles.loadRolesErrorDetail'),
        }),
    });
  }

  private roleLabel(row: CatalogRow): string {
    const app = row['SApplication'] as Record<string, unknown> | undefined;
    const appName = app ? String(app['DesApplication'] ?? '') : this.transloco.translate('menuConfig.applicationRoles.noApplicationFallback');
    return `${appName} — ${row['DesApplicationRole']}`;
  }

  onRoleChange(codApplicationRole: string | null): void {
    this.selectedRole.set(codApplicationRole ?? '');
    if (!codApplicationRole) {
      this.matrix.set([]);
      return;
    }
    // Se releen los ítems de menú acá (en vez de una sola vez en el
    // constructor) por el mismo motivo que `loadApplicationRoles`: puede
    // haberse creado un ítem nuevo en la pestaña de "Ítems de menú" después
    // de que esta pestaña ya estaba montada.
    this.loading.set(true);
    this.catalogService.list(SITE_MAP_PATH).subscribe({
      next: (rows) => {
        this.allSiteMaps = rows;
        this.loadMatrix(codApplicationRole);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('menuConfig.siteMapRoles.loadSiteMapErrorDetail'),
        });
      },
    });
  }

  private orderedSiteMaps(): { row: CatalogRow; level: number }[] {
    const byParent = new Map<string | null, CatalogRow[]>();
    for (const row of this.allSiteMaps) {
      const parentValue = row['IdeSiteMapParent'];
      const parent = parentValue ? String(parentValue) : null;
      const list = byParent.get(parent) ?? [];
      list.push(row);
      byParent.set(parent, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => Number(a['NumOrder'] ?? 0) - Number(b['NumOrder'] ?? 0));
    }
    const result: { row: CatalogRow; level: number }[] = [];
    const walk = (parent: string | null, level: number) => {
      for (const row of byParent.get(parent) ?? []) {
        result.push({ row, level });
        walk(String(row['IdeSiteMap']), level + 1);
      }
    };
    walk(null, 1);
    return result;
  }

  private loadMatrix(codApplicationRole: string): void {
    this.loading.set(true);
    this.catalogService.list(SITE_MAP_ROLES_PATH, { codApplicationRole }).subscribe({
      next: (grants) => {
        const grantBySiteMap = new Map<string, CatalogRow>();
        for (const grant of grants) {
          const siteMap = grant['SSiteMap'] as Record<string, unknown> | undefined;
          const codSiteMap = siteMap ? String(siteMap['CodSiteMap'] ?? '') : '';
          if (codSiteMap) grantBySiteMap.set(codSiteMap, grant);
        }
        this.matrix.set(
          this.orderedSiteMaps().map(({ row, level }) => {
            const grant = grantBySiteMap.get(String(row['CodSiteMap']));
            const active = !!grant && grant.SState?.CodState === 'ACTIVO';
            return {
              siteMap: row,
              level,
              granted: active,
              grantId: grant ? String(grant['IdeSiteMapRole']) : null,
            };
          }),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('menuConfig.siteMapRoles.loadMatrixErrorDetail'),
        });
      },
    });
  }

  toggle(matrixRow: MatrixRow): void {
    const role = this.selectedRole();
    if (!role) return;
    const wantGranted = !matrixRow.granted;

    if (!matrixRow.grantId) {
      // Todavía no existe la concesión -- se crea (nace en ACTIVO).
      this.catalogService
        .create(SITE_MAP_ROLES_PATH, {
          codSiteMap: String(matrixRow.siteMap['CodSiteMap']),
          codApplicationRole: role,
        })
        .subscribe({
          next: (created) => {
            matrixRow.granted = true;
            matrixRow.grantId = String(created['IdeSiteMapRole']);
            this.matrix.set([...this.matrix()]);
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
      return;
    }

    const nextState = wantGranted ? 'ACTIVO' : 'INACTIVO';
    this.catalogService.setState(SITE_MAP_ROLES_PATH, matrixRow.grantId, nextState).subscribe({
      next: () => {
        matrixRow.granted = wantGranted;
        this.matrix.set([...this.matrix()]);
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
