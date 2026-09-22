import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const RATE_TABLES_PATH = '/product-rating/rate-tables';
const RATE_FACTORS_PATH = '/product-rating/rate-factors';
const RATE_VALUES_PATH = '/product-rating/rate-values';
const FIELD_DICTIONARY_PATH = '/reference-data/field-dictionary';

/**
 * "Tablas de tarifa" (`SRateTable`/`SRateFactor`/`SRateValue`, ver el
 * README de product-rating-service, sección "CRUD real de tablas de
 * tarifa"): una tabla arriba (`SRateTable`) y, al "Configurar" una fila,
 * el detalle con sus Factores (hasta 5, qué representa cada columna
 * Factor1..5) y sus Valores (filas concretas, con vigencia y hasta 5
 * valores de factor). A diferencia de "Productos", acá el backend SÍ
 * filtra ambos hijos por `codRateTable` en el `GET` de lista, así que no
 * hace falta filtrar client-side.
 *
 * OJO (documentado tal cual en el README, no es un olvido de esta
 * pantalla): el equivalente a `FGetRateValue` para desempate cuando más
 * de una fila calza NO está implementado -- esto es sólo el CRUD de
 * configuración.
 */
@Component({
  selector: 'app-rate-tables',
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
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './rate-tables.component.html',
})
export class RateTablesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  readonly selectedTable = signal<CatalogRow | null>(null);

  // --- Factores ---
  readonly factors = signal<CatalogRow[]>([]);
  readonly factorsLoading = signal(false);
  readonly fieldDictionary = signal<CatalogRow[]>([]);
  readonly factorDialogVisible = signal(false);
  readonly factorDialogMode = signal<'create' | 'edit'>('create');
  private editingFactor: CatalogRow | null = null;
  factorForm = this.buildFactorForm();

  // --- Valores ---
  readonly values = signal<CatalogRow[]>([]);
  readonly valuesLoading = signal(false);
  readonly valueDialogVisible = signal(false);
  readonly valueDialogMode = signal<'create' | 'edit'>('create');
  private editingValue: CatalogRow | null = null;
  valueForm = this.buildValueForm();

  form = this.buildForm();

  /** Etiquetas Factor1.."Factor5" según lo que cada factor represente
   * (`SFieldDictionary.DesFieldDictionary`), para no mostrar columnas
   * genéricas cuando ya se sabe qué es cada una. */
  readonly factorLabels = computed<Partial<Record<number, string>>>(() => {
    const labels: Partial<Record<number, string>> = {};
    for (const factor of this.factors()) {
      const order = Number(factor['NumOrder']);
      const field = factor['SFieldDictionary'] as Record<string, unknown> | undefined;
      labels[order] = field
        ? String(field['DesFieldDictionary'] ?? this.transloco.translate('rateTables.factorPrefix', { num: order }))
        : this.transloco.translate('rateTables.factorPrefix', { num: order });
    }
    return labels;
  });

  constructor() {
    this.load();
  }

  private buildForm(row?: CatalogRow) {
    return this.fb.nonNullable.group({
      cod: [
        { value: row ? String(row['CodRateTable'] ?? '') : '', disabled: !!row },
        [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)],
      ],
      des: [row ? String(row['DesRateTable'] ?? '') : '', Validators.required],
    });
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(RATE_TABLES_PATH).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        const current = this.selectedTable();
        if (current) {
          const fresh = rows.find((r) => r['IdeRateTable'] === current['IdeRateTable']);
          this.selectedTable.set(fresh ?? null);
        }
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('rateTables.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  configure(row: CatalogRow): void {
    this.selectedTable.set(row);
    this.loadFactors();
    this.loadValues();
  }

  closeDetail(): void {
    this.selectedTable.set(null);
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.form = this.buildForm();
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.form = this.buildForm(row);
    this.dialogVisible.set(true);
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
      this.catalogService.create(RATE_TABLES_PATH, { codRateTable: raw.cod, desRateTable: raw.des }).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.createdDetail', { item: raw.des }),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdeRateTable']);
      this.catalogService.update(RATE_TABLES_PATH, id, { desRateTable: raw.des }).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.updatedDetail', { item: raw.des }),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    const desc = String(row['DesRateTable'] ?? '');
    const action = this.transloco.translate<string>(
      nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
    );
    this.confirm.confirm({
      header: this.transloco.translate<string>(
        nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader',
      ),
      message: this.transloco.translate<string>('catalogs.toggleConfirm', { action, item: desc }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeRateTable']);
        this.catalogService.setState(RATE_TABLES_PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('common.stateUpdated'),
            });
            this.load();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
      },
    });
  }

  // ===================== Factores =====================

  private buildFactorForm(row?: CatalogRow) {
    const field = row?.['SFieldDictionary'] as Record<string, unknown> | undefined;
    return this.fb.nonNullable.group({
      numOrder: [row ? Number(row['NumOrder'] ?? 1) : 1, [Validators.required, Validators.min(1), Validators.max(5)]],
      codFieldDictionary: [field ? String(field['CodFieldDictionary'] ?? '') : ''],
    });
  }

  private loadFactors(): void {
    const codRateTable = this.selectedTable()?.['CodRateTable'];
    if (!codRateTable) return;
    this.factorsLoading.set(true);
    this.catalogService.list(RATE_FACTORS_PATH, { codRateTable: String(codRateTable) }).subscribe({
      next: (rows) => {
        this.factors.set(rows);
        this.factorsLoading.set(false);
      },
      error: () => {
        this.factorsLoading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('rateTables.loadErrorFactorsDetail'),
        });
      },
    });
  }

  private loadFieldDictionary(): void {
    this.catalogService.list(FIELD_DICTIONARY_PATH).subscribe({ next: (rows) => this.fieldDictionary.set(rows) });
  }

  openCreateFactor(): void {
    this.factorDialogMode.set('create');
    this.editingFactor = null;
    this.loadFieldDictionary();
    this.factorForm = this.buildFactorForm();
    this.factorDialogVisible.set(true);
  }

  openEditFactor(row: CatalogRow): void {
    this.factorDialogMode.set('edit');
    this.editingFactor = row;
    this.loadFieldDictionary();
    this.factorForm = this.buildFactorForm(row);
    this.factorDialogVisible.set(true);
  }

  closeFactorDialog(): void {
    this.factorDialogVisible.set(false);
  }

  submitFactor(): void {
    if (this.factorForm.invalid) {
      this.factorForm.markAllAsTouched();
      return;
    }
    const raw = this.factorForm.getRawValue();
    const body: Record<string, unknown> = { numOrder: raw.numOrder };
    if (raw.codFieldDictionary) body['codFieldDictionary'] = raw.codFieldDictionary;

    if (this.factorDialogMode() === 'create') {
      this.catalogService
        .create(RATE_FACTORS_PATH, { codRateTable: this.selectedTable()!['CodRateTable'], ...body })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('rateTables.factorCreatedDetail'),
            });
            this.closeFactorDialog();
            this.loadFactors();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingFactor!['IdeRateFactor']);
      this.catalogService.update(RATE_FACTORS_PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('rateTables.factorUpdatedDetail'),
          });
          this.closeFactorDialog();
          this.loadFactors();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  // ===================== Valores =====================

  private buildValueForm(row?: CatalogRow) {
    return this.fb.nonNullable.group({
      factor1: [row ? String(row['Factor1'] ?? '') : ''],
      factor2: [row ? String(row['Factor2'] ?? '') : ''],
      factor3: [row ? String(row['Factor3'] ?? '') : ''],
      factor4: [row ? String(row['Factor4'] ?? '') : ''],
      factor5: [row ? String(row['Factor5'] ?? '') : ''],
      value: [row ? String(row['Value'] ?? '') : ''],
      tstInit: [row ? this.toDateInput(row['TstInit']) : '', Validators.required],
      tstEnd: [row ? this.toDateInput(row['TstEnd']) : '', Validators.required],
    });
  }

  private toDateInput(value: unknown): string {
    return value ? String(value).slice(0, 10) : '';
  }

  private loadValues(): void {
    const codRateTable = this.selectedTable()?.['CodRateTable'];
    if (!codRateTable) return;
    this.valuesLoading.set(true);
    this.catalogService.list(RATE_VALUES_PATH, { codRateTable: String(codRateTable) }).subscribe({
      next: (rows) => {
        this.values.set(rows);
        this.valuesLoading.set(false);
      },
      error: () => {
        this.valuesLoading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('rateTables.loadErrorValuesDetail'),
        });
      },
    });
  }

  isValueActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  openCreateValue(): void {
    this.valueDialogMode.set('create');
    this.editingValue = null;
    this.valueForm = this.buildValueForm();
    this.valueDialogVisible.set(true);
  }

  openEditValue(row: CatalogRow): void {
    this.valueDialogMode.set('edit');
    this.editingValue = row;
    this.valueForm = this.buildValueForm(row);
    this.valueDialogVisible.set(true);
  }

  closeValueDialog(): void {
    this.valueDialogVisible.set(false);
  }

  submitValue(): void {
    if (this.valueForm.invalid) {
      this.valueForm.markAllAsTouched();
      return;
    }
    const raw = this.valueForm.getRawValue();
    const body: Record<string, unknown> = { tstInit: raw.tstInit, tstEnd: raw.tstEnd };
    for (const key of ['factor1', 'factor2', 'factor3', 'factor4', 'factor5', 'value'] as const) {
      if (raw[key]) body[key] = raw[key];
    }

    if (this.valueDialogMode() === 'create') {
      this.catalogService
        .create(RATE_VALUES_PATH, { codRateTable: this.selectedTable()!['CodRateTable'], ...body })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('rateTables.valueCreatedDetail'),
            });
            this.closeValueDialog();
            this.loadValues();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingValue!['IdeRateValue']);
      this.catalogService.update(RATE_VALUES_PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('rateTables.valueUpdatedDetail'),
          });
          this.closeValueDialog();
          this.loadValues();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  toggleValueState(row: CatalogRow): void {
    const nextState = this.isValueActive(row) ? 'INACTIVO' : 'ACTIVO';
    const action = this.transloco.translate<string>(
      nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
    );
    this.confirm.confirm({
      header: this.transloco.translate<string>(
        nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader',
      ),
      message: this.transloco.translate<string>('rateTables.toggleValueConfirm', { action }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeRateValue']);
        this.catalogService.setState(RATE_VALUES_PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('common.stateUpdated'),
            });
            this.loadValues();
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
