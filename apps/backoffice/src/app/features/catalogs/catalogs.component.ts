import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import {
  COMMON_CATALOG_REGISTRY,
  CatalogConfig,
  CatalogExtraField,
  CatalogRow,
  codKey,
  desKey,
  extraRowField,
} from '../../core/catalogs/catalog.model';

/** Pantalla genérica de catálogos: una lista de catálogos a la izquierda
 * (mismo patrón `CatalogCrudService` para todos) y, a la derecha, una
 * tabla genérica con alta/edición/activar-inactivar -- un solo componente
 * reutilizado tanto para "Catálogos" (comunes, `COMMON_CATALOG_REGISTRY`,
 * default) como para "Catálogos de producto"
 * (`PRODUCT_CATALOG_REGISTRY`, ver `app.routes.ts`) -- cuál registro y
 * qué título/subtítulo mostrar vienen de `route.data`, resuelto en el
 * constructor (no `input()`: esta ruta no usa `withComponentInputBinding`,
 * y agregarlo solo para esto no valía la pena). `SLocation` no está en
 * ningún registro (ver el comentario en `catalog.model.ts`). */
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
    TextareaModule,
    SelectModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './catalogs.component.html',
})
export class CatalogsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);

  readonly registry: CatalogConfig[] =
    (this.route.snapshot.data['registry'] as CatalogConfig[] | undefined) ?? COMMON_CATALOG_REGISTRY;
  readonly pageTitle: string =
    (this.route.snapshot.data['pageTitle'] as string | undefined) ?? 'catalogs.defaultPageTitle';
  readonly pageSubtitle: string =
    (this.route.snapshot.data['pageSubtitle'] as string | undefined) ?? 'catalogs.defaultPageSubtitle';
  readonly selected = signal<CatalogConfig>(this.registry[0]);
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

  /** Campos extra visibles como columna en la tabla -- `hideInList` los
   * saca del listado (pensado para `desLarge`: texto largo de venta que
   * ensuciaría la tabla) sin sacarlos del formulario de alta/edición. */
  readonly visibleExtraFields = computed(() =>
    (this.selected().extraFields ?? []).filter((field) => !field.hideInList),
  );

  readonly dialogTitle = computed(() => {
    const item = this.transloco.translate(this.selected().singular);
    return this.dialogMode() === 'create'
      ? this.transloco.translate('catalogs.dialogTitleCreate', { item })
      : this.transloco.translate('catalogs.dialogTitleEdit', { item });
  });

  constructor() {
    this.loadRows();
  }

  selectCatalog(config: CatalogConfig): void {
    if (config.key === this.selected().key) return;
    // El diálogo de alta/edición vive siempre en el DOM (`p-dialog` solo
    // lo oculta con CSS, no lo saca del árbol de Angular -- no hay
    // `@if`/`*ngIf` alrededor), así que su `@for` de campos extra sigue
    // reaccionando a `selected()` aunque el diálogo esté cerrado. Si no
    // se cierra acá, cambiar de catálogo con el diálogo abierto deja su
    // título/campos apuntando al catálogo nuevo mientras `this.form`
    // sigue siendo el del catálogo anterior -- confuso en el mejor caso.
    this.dialogVisible.set(false);
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
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('catalogs.loadErrorDetail', {
            item: this.transloco.translate(this.selected().label).toLowerCase(),
          }),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  /** Nunca debe devolver `null`: el `@for` de campos extra del diálogo
   * (`catalogs.component.html`) está siempre en el árbol de Angular
   * (`p-dialog` solo oculta con CSS) y reacciona a `selected()` en
   * cuanto se cambia de catálogo, incluso con el diálogo cerrado o
   * apuntando todavía al `form` de OTRO catálogo (`buildForm()` solo se
   * llama al abrir el diálogo, en `openCreate`/`openEdit`) -- devolver
   * `null` ahí hacía que `p-select`/`pInputText` recibieran un
   * `[formControl]` nulo y tiraran `TypeError: null is not an object
   * (evaluating 'this.ngControl.valueChanges.subscribe')`, abortando el
   * ciclo de detección de cambios a mitad de camino (de ahí que la
   * tabla se quedara mostrando los datos del catálogo anterior). Si el
   * control todavía no existe para esta clave, se crea uno vacío al
   * vuelo -- inofensivo: en cuanto se abre el diálogo de verdad,
   * `buildForm()` reemplaza `this.form` entero con los controles
   * correctos para ese catálogo. */
  getExtraControl(key: string): FormControl<string> {
    const extra = this.form.controls.extra;
    const existing = extra.get(key) as FormControl<string> | null;
    if (existing) return existing;
    const fallback = this.fb.nonNullable.control('');
    extra.addControl(key, fallback);
    return fallback;
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
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.createdDetail', { item: raw.des }),
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
    const config = this.selected();
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    const desc = String(row[config.desField] ?? '');
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
        const id = String(row[config.idField]);
        this.catalogService.setState(config.path, id, nextState).subscribe({
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
