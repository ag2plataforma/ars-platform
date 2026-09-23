import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/party/commissions';
const TABLES_PATH = '/party/commission-tables';
const PROCESSES_PATH = '/party/processes';

/**
 * `SCommission` -- el porcentaje efectivo que cobra una tabla
 * (`SCommissionTable`) para un proceso puntual (`SProcess`, ej. el de
 * `RECEGENE`), vigente en un rango de fechas. Sin Cod/Des propio -- es
 * una fila de configuración pura, no un catálogo. `codCommissionTable`
 * y `codProcess` son INMUTABLES después de creada (excluidos del
 * `UpdateCommissionDto` real del backend) -- se deshabilitan en edición,
 * igual que el código en las otras pestañas. `NumMovement` lo calcula
 * el backend solo (max+1 por tabla+proceso) -- no se pide en el
 * formulario, solo se muestra informativo en el listado.
 *
 * Fechas como `<input type="date">` nativo (sin datepicker de PrimeNG,
 * mismo criterio ya aplicado en este proyecto) -- el DTO acepta
 * `@IsDateString()` y un string "YYYY-MM-DD" es ISO 8601 válido.
 */
@Component({
  selector: 'app-commissions-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './commissions-tab.component.html',
})
export class CommissionsTabComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly tables = signal<CatalogRow[]>([]);
  readonly processes = signal<CatalogRow[]>([]);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.fb.nonNullable.group({
    codCommissionTable: ['', Validators.required],
    codProcess: ['', Validators.required],
    percentaje: [10, [Validators.required, Validators.min(0.01)]],
    tstInitial: ['', Validators.required],
    tstEnd: ['', Validators.required],
  });

  constructor() {
    this.loadDependents();
    this.load();
  }

  private loadDependents(): void {
    this.catalogService.list(TABLES_PATH).subscribe({
      next: (rows) => this.tables.set(rows),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.commissionsTab_.loadTablesErrorDetail'),
        }),
    });
    this.catalogService.list(PROCESSES_PATH).subscribe({
      next: (rows) => this.processes.set(rows),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.commissionsTab_.loadProcessesErrorDetail'),
        }),
    });
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(PATH).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.commissionsTab_.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  tableName(row: CatalogRow): string {
    const table = row['SCommissionTable'] as CatalogRow | undefined;
    return table ? String(table['DesCommissionTable'] ?? '') : this.transloco.translate('commissions.noTableFallback');
  }

  processName(row: CatalogRow): string {
    const process = row['SProcess'] as CatalogRow | undefined;
    return process ? String(process['DesProcess'] ?? '') : this.transloco.translate('commissions.noProcessFallback');
  }

  formatDate(value: unknown): string {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  private tableCode(row: CatalogRow): string {
    const table = row['SCommissionTable'] as CatalogRow | undefined;
    return table ? String(table['CodCommissionTable'] ?? '') : '';
  }

  private processCode(row: CatalogRow): string {
    const process = row['SProcess'] as CatalogRow | undefined;
    return process ? String(process['CodProcess'] ?? '') : '';
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.loadDependents();
    this.form = this.fb.nonNullable.group({
      codCommissionTable: ['', Validators.required],
      codProcess: ['', Validators.required],
      percentaje: [10, [Validators.required, Validators.min(0.01)]],
      tstInitial: ['', Validators.required],
      tstEnd: ['', Validators.required],
    });
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.loadDependents();
    this.form = this.fb.nonNullable.group({
      codCommissionTable: [{ value: this.tableCode(row), disabled: true }],
      codProcess: [{ value: this.processCode(row), disabled: true }],
      percentaje: [Number(row['Percentaje'] ?? 0), [Validators.required, Validators.min(0.01)]],
      tstInitial: [this.formatDate(row['TstInitial']), Validators.required],
      tstEnd: [this.formatDate(row['TstEnd']), Validators.required],
    });
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
      this.catalogService
        .create(PATH, {
          codCommissionTable: raw.codCommissionTable,
          codProcess: raw.codProcess,
          percentaje: raw.percentaje,
          tstInitial: raw.tstInitial,
          tstEnd: raw.tstEnd,
        })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('commissions.commissionsTab_.savedDetail'),
            });
            this.closeDialog();
            this.load();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeCommission']);
      this.catalogService
        .update(PATH, id, { percentaje: raw.percentaje, tstInitial: raw.tstInitial, tstEnd: raw.tstEnd })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('commissions.commissionsTab_.savedDetail'),
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
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: this.tableName(row),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeCommission']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('commissions.commissionsTab_.toggledDetail'),
            });
            this.load();
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
