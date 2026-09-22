import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService, MenuItem } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const LOCATIONS_PATH = '/reference-data/locations';
const COUNTRIES_PATH = '/reference-data/countries';

interface Crumb {
  cod: string;
  des: string;
}

/** `SLocation` (divisiones geográficas -- jerárquico, ligado opcionalmente a
 * un país) queda fuera del `CatalogsComponent` genérico porque su unicidad
 * real es compuesta (`CodLocation`+`IdeCountry`, no un código único
 * global -- confirmado en `locations.service.ts`) y tiene jerarquía propia
 * vía `codLocationParent`. Navegación por "breadcrumb": en vez de armar un
 * árbol completo del lado del cliente, se pide a cada nivel solo sus hijos
 * directos (`GET /locations?codLocationParent=<cod o ''>`), que es
 * exactamente el filtro que ya expone el backend.
 *
 * **Deliberadamente afuera de esta primera versión**: reasignar el país o
 * mover una ubicación a otro padre (`UpdateLocationDto.codLocationParent`
 * sí lo soporta el backend, `codCountry` no -- el país solo se fija al
 * crear). Armar un selector de "ubicación padre" entre potencialmente
 * miles de filas necesita búsqueda, no un simple `p-select`; se deja para
 * una vuelta futura si hace falta reordenar el árbol ya cargado. */
@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TagModule,
    BreadcrumbModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './locations.component.html',
})
export class LocationsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly countries = signal<CatalogRow[]>([]);
  readonly countryFilter = signal<string>('');
  readonly path = signal<Crumb[]>([]);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  readonly home: MenuItem = {
    icon: 'pi pi-map',
    label: this.transloco.translate('locations.title'),
    command: () => this.goToRoot(),
  };

  form = this.fb.nonNullable.group({
    cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
    des: ['', Validators.required],
    codCountry: [''],
  });

  constructor() {
    this.catalogService.list(COUNTRIES_PATH).subscribe((countries) => this.countries.set(countries));
    this.loadRows();
  }

  get breadcrumbModel(): MenuItem[] {
    return this.path().map((crumb, index) => ({
      label: crumb.des,
      command: () => this.goToLevel(index),
    }));
  }

  goToRoot(): void {
    this.path.set([]);
    this.loadRows();
  }

  goToLevel(index: number): void {
    this.path.update((current) => current.slice(0, index + 1));
    this.loadRows();
  }

  drillInto(row: CatalogRow): void {
    this.path.update((current) => [
      ...current,
      { cod: String(row['CodLocation']), des: String(row['DesLocation']) },
    ]);
    this.loadRows();
  }

  onCountryFilterChange(value: string | null): void {
    this.countryFilter.set(value ?? '');
    this.path.set([]);
    this.loadRows();
  }

  private loadRows(): void {
    this.loading.set(true);
    const params: Record<string, string> = {
      codLocationParent: this.path().length ? this.path()[this.path().length - 1].cod : '',
    };
    if (this.countryFilter()) {
      params['codCountry'] = this.countryFilter();
    }
    this.catalogService.list(LOCATIONS_PATH, params).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('locations.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  countryName(row: CatalogRow): string {
    const country = row['SCountry'] as Record<string, unknown> | undefined;
    return country ? String(country['DesCountry'] ?? '') : this.transloco.translate('locations.noCountry');
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.form = this.fb.nonNullable.group({
      cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      des: ['', Validators.required],
      codCountry: [this.countryFilter()],
    });
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.form = this.fb.nonNullable.group({
      cod: [{ value: String(row['CodLocation'] ?? ''), disabled: true }],
      des: [String(row['DesLocation'] ?? ''), Validators.required],
      codCountry: [{ value: this.rowCountryCode(row), disabled: true }],
    });
    this.dialogVisible.set(true);
  }

  private rowCountryCode(row: CatalogRow): string {
    const country = row['SCountry'] as Record<string, unknown> | undefined;
    return country ? String(country['CodCountry'] ?? '') : '';
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();

    if (this.dialogMode() === 'create') {
      const body: Record<string, unknown> = { codLocation: raw.cod, desLocation: raw.des };
      if (raw.codCountry) body['codCountry'] = raw.codCountry;
      if (this.path().length) body['codLocationParent'] = this.path()[this.path().length - 1].cod;
      this.catalogService.create(LOCATIONS_PATH, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.createdDetail', { item: raw.des }),
          });
          this.closeDialog();
          this.loadRows();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdeLocation']);
      this.catalogService.update(LOCATIONS_PATH, id, { desLocation: raw.des }).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.updatedDetail', { item: raw.des }),
          });
          this.closeDialog();
          this.loadRows();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    const desc = String(row['DesLocation'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(
          nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
        ),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeLocation']);
        this.catalogService.setState(LOCATIONS_PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('catalogs.toggledDetail', {
                item: desc,
                state: this.transloco.translate(nextState === 'ACTIVO' ? 'common.active' : 'common.inactive').toLowerCase(),
              }),
            });
            this.loadRows();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
      },
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
