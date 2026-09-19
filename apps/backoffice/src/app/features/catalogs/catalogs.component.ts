import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { CatalogService } from '../../core/catalogs/catalog.service';
import {
  CATALOG_REGISTRY,
  CatalogConfig,
  CatalogExtraField,
  CatalogRow,
  codKey,
  desKey,
  extraRowField,
} from '../../core/catalogs/catalog.model';

/** Pantalla única de "Catálogos comunes": una lista de catálogos a la
 * izquierda (mismo patrón `CatalogCrudService` para todos) y, a la derecha,
 * una tabla genérica con alta/edición/activar-inactivar -- un solo
 * componente reutilizado para los 9 catálogos de `CATALOG_REGISTRY` en vez
 * de una pantalla por catálogo. `SLocation` no está acá (ver el comentario
 * en `catalog.model.ts`). */
@Component({
  selector: 'app-catalogs',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './catalogs.component.html',
})
export class CatalogsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly catalogs = CATALOG_REGISTRY;
  readonly selected = signal<CatalogConfig>(CATALOG_REGISTRY[0]);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  /** Opciones de los `select` (cacheadas por `optionsPath`, ej. idiomas para países). */
  private readonly optionsCache = new Map<string, CatalogRow[]>();
  readonly extraFieldOptions = signal<Record<string, CatalogRow[]>>({});

  form = this.fb.nonNullable.group({
    cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
    des: ['', Validators.required],
    extra: this.fb.group({}),
  });

  readonly dialogTitle = computed(() =>
    this.dialogMode() === 'create'
      ? `Nuevo ${this.selected().singular}`
      : `Editar ${this.selected().singular}`,
  );

  constructor() {
    this.loadRows();
  }

  selectCatalog(config: CatalogConfig): void {
    if (config.key === this.selected().key) return;
    this.selected.set(config);
    this.loadRows();
  }

  private loadRows(): void {
    this.loading.set(true);
    this.catalogService.list(this.selected().path).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Error',
          detail: `No se pudieron cargar ${this.selected().label.toLowerCase()}.`,
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  getExtraControl(key: string): FormControl<string> {
    return this.form.controls.extra.get(key) as FormControl<string>;
  }

  extraColumnValue(row: CatalogRow, field: CatalogExtraField): string {
    if (field.columnRelation && field.optionDesField) {
      const related = row[field.columnRelation] as Record<string, unknown> | undefined;
      return related ? String(related[field.optionDesField] ?? '') : '';
    }
    return String(row[extraRowField(field)] ?? '');
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.buildForm();
    this.loadExtraFieldOptions();
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.buildForm(row);
    this.loadExtraFieldOptions();
    this.dialogVisible.set(true);
  }

  private buildForm(row?: CatalogRow): void {
    const config = this.selected();
    const extraGroup = this.fb.group({});
    for (const field of config.extraFields ?? []) {
      const currentValue: string = row
        ? field.columnRelation
          ? String(
              (row[field.columnRelation] as Record<string, unknown> | undefined)?.[
                field.optionCodField ?? ''
              ] ?? '',
            )
          : String(row[extraRowField(field)] ?? '')
        : '';
      extraGroup.addControl(
        field.key,
        this.fb.control(currentValue, field.required ? Validators.required : []),
      );
    }
    this.form = this.fb.nonNullable.group({
      cod: [
        { value: row ? String(row[config.codField] ?? '') : '', disabled: !!row },
        [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)],
      ],
      des: [row ? String(row[config.desField] ?? '') : '', Validators.required],
      extra: extraGroup,
    });
  }

  private loadExtraFieldOptions(): void {
    const config = this.selected();
    for (const field of config.extraFields ?? []) {
      if (field.type !== 'select' || !field.optionsPath) continue;
      const cached = this.optionsCache.get(field.optionsPath);
      if (cached) {
        this.extraFieldOptions.update((current) => ({ ...current, [field.key]: cached }));
        continue;
      }
      this.catalogService.list(field.optionsPath).subscribe({
        next: (options) => {
          this.optionsCache.set(field.optionsPath!, options);
          this.extraFieldOptions.update((current) => ({ ...current, [field.key]: options }));
        },
      });
    }
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const config = this.selected();
    const raw = this.form.getRawValue();
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw.extra)) {
      if (value === '' || value === null || value === undefined) continue;
      extra[key] = value;
    }

    if (this.dialogMode() === 'create') {
      const body = { [codKey(config)]: raw.cod, [desKey(config)]: raw.des, ...extra };
      this.catalogService.create(config.path, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: 'Listo',
            detail: `Se creó "${raw.des}".`,
          });
          this.closeDialog();
          this.loadRows();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow![config.idField]);
      const body = { [desKey(config)]: raw.des, ...extra };
      this.catalogService.update(config.path, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: 'Listo',
            detail: `Se actualizó "${raw.des}".`,
          });
          this.closeDialog();
          this.loadRows();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  toggleState(row: CatalogRow): void {
    const config = this.selected();
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    const desc = String(row[config.desField] ?? '');
    this.confirm.confirm({
      header: nextState === 'ACTIVO' ? 'Activar' : 'Inactivar',
      message: `¿Confirmás ${nextState === 'ACTIVO' ? 'activar' : 'inactivar'} "${desc}"?`,
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row[config.idField]);
        this.catalogService.setState(config.path, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: 'Listo',
              detail: `"${desc}" ahora está ${nextState === 'ACTIVO' ? 'activo' : 'inactivo'}.`,
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
        : null) ?? 'Ocurrió un error inesperado.';
    this.messages.add({ severity: 'error', summary: 'Error', detail });
  }
}
