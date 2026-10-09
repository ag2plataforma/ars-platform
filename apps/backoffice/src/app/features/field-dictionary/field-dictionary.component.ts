import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const FIELDS_PATH = '/reference-data/field-dictionary';
const VALUES_PATH = '/reference-data/field-values';

type Kind = 'field' | 'value';

/**
 * Diccionario de campos (`SFieldDictionary`) y los valores posibles de cada campo (`SFieldValue`),
 * en una sola pantalla maestro-detalle: a la izquierda los campos; al elegir uno, a la derecha
 * sus valores. Los usan los factores de las tablas de tarifa y los atributos de riesgo.
 */
@Component({
  selector: 'app-field-dictionary',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './field-dictionary.component.html',
})
export class FieldDictionaryComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalog = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly fields = signal<CatalogRow[]>([]);
  readonly values = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly selectedCode = signal<string | null>(null);

  readonly selectedField = computed(
    () => this.fields().find((f) => f['CodFieldDictionary'] === this.selectedCode()) ?? null,
  );
  readonly selectedValues = computed(() =>
    this.values().filter(
      (v) => (v['SFieldDictionary'] as { CodFieldDictionary?: string } | undefined)?.CodFieldDictionary === this.selectedCode(),
    ),
  );
  /** Nº de valores por campo (para la columna «Valores»). */
  readonly valueCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const v of this.values()) {
      const cod = (v['SFieldDictionary'] as { CodFieldDictionary?: string } | undefined)?.CodFieldDictionary;
      if (cod) counts.set(cod, (counts.get(cod) ?? 0) + 1);
    }
    return counts;
  });

  readonly dialogVisible = signal(false);
  readonly dialogKind = signal<Kind>('field');
  readonly dialogMode = signal<'create' | 'edit'>('create');
  readonly saving = signal(false);
  private editing: CatalogRow | null = null;
  form = this.buildForm();

  constructor() {
    this.load();
  }

  private buildForm(row?: CatalogRow, kind: Kind = 'field') {
    const cod = kind === 'field' ? 'CodFieldDictionary' : 'CodFieldValue';
    const des = kind === 'field' ? 'DesFieldDictionary' : 'DesFieldValue';
    return this.fb.nonNullable.group({
      cod: [
        { value: row ? String(row[cod] ?? '') : '', disabled: !!row },
        [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)],
      ],
      des: [row ? String(row[des] ?? '') : '', Validators.required],
    });
  }

  load(): void {
    this.loading.set(true);
    this.catalog.list(FIELDS_PATH).subscribe({
      next: (rows) => {
        this.fields.set(rows);
        this.catalog.list(VALUES_PATH).subscribe({
          next: (vals) => {
            this.values.set(vals);
            this.loading.set(false);
          },
          error: () => this.loadFailed(),
        });
      },
      error: () => this.loadFailed(),
    });
  }

  private loadFailed(): void {
    this.loading.set(false);
    this.messages.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('fieldDictionary.loadError'),
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  selectField(row: CatalogRow): void {
    this.selectedCode.set(String(row['CodFieldDictionary']));
  }

  openCreate(kind: Kind): void {
    this.dialogKind.set(kind);
    this.dialogMode.set('create');
    this.editing = null;
    this.form = this.buildForm(undefined, kind);
    this.dialogVisible.set(true);
  }

  openEdit(kind: Kind, row: CatalogRow): void {
    this.dialogKind.set(kind);
    this.dialogMode.set('edit');
    this.editing = row;
    this.form = this.buildForm(row, kind);
    this.dialogVisible.set(true);
  }

  dialogTitle(): string {
    const kind = this.dialogKind();
    const mode = this.dialogMode();
    const field = String(this.selectedField()?.['DesFieldDictionary'] ?? '');
    if (kind === 'field') {
      return this.transloco.translate(mode === 'create' ? 'fieldDictionary.fieldDialogCreate' : 'fieldDictionary.fieldDialogEdit');
    }
    return this.transloco.translate(
      mode === 'create' ? 'fieldDictionary.valueDialogCreate' : 'fieldDictionary.valueDialogEdit',
      { field },
    );
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
    const kind = this.dialogKind();
    const path = kind === 'field' ? FIELDS_PATH : VALUES_PATH;
    const codKey = kind === 'field' ? 'codFieldDictionary' : 'codFieldValue';
    const desKey = kind === 'field' ? 'desFieldDictionary' : 'desFieldValue';
    const parent = kind === 'value' ? { codFieldDictionary: this.selectedCode() } : {};
    this.saving.set(true);

    const request =
      this.dialogMode() === 'create'
        ? this.catalog.create(path, { [codKey]: raw.cod, [desKey]: raw.des, ...parent })
        : this.catalog.update(
            path,
            String(this.editing![kind === 'field' ? 'IdeFieldDictionary' : 'IdeFieldValue']),
            { [desKey]: raw.des },
          );
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate(
            this.dialogMode() === 'create' ? 'fieldDictionary.created' : 'fieldDictionary.updated',
            { item: raw.des },
          ),
        });
        const createdField = kind === 'field' && this.dialogMode() === 'create' ? raw.cod : null;
        this.closeDialog();
        this.load();
        if (createdField) this.selectedCode.set(createdField);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.showError(err);
      },
    });
  }

  toggleState(kind: Kind, row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    const path = kind === 'field' ? FIELDS_PATH : VALUES_PATH;
    const id = String(row[kind === 'field' ? 'IdeFieldDictionary' : 'IdeFieldValue']);
    const item = String(row[kind === 'field' ? 'DesFieldDictionary' : 'DesFieldValue']);
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('fieldDictionary.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'fieldDictionary.activate' : 'fieldDictionary.deactivate'),
        item,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () =>
        this.catalog.setState(path, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('fieldDictionary.toggled', {
                item,
                state: this.transloco.translate(nextState === 'ACTIVO' ? 'common.active' : 'common.inactive').toLowerCase(),
              }),
            });
            this.load();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        }),
    });
  }

  private showError(err: HttpErrorResponse): void {
    const raw = err.error && typeof err.error === 'object' && 'message' in err.error ? (err.error as { message: unknown }).message : null;
    const detail = Array.isArray(raw) ? raw.join(', ') : raw ? String(raw) : this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
