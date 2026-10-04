import { Component, OnInit, inject, input, signal } from '@angular/core';
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
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/product-rating/product-payment-fractions';
const FRACTIONS_PATH = '/product-rating/payment-fractions';
const DEFAULT_END_DATE = '2099-12-31';

/**
 * `SProductPaymentFraction` -- qué fracciones de pago se ofrecen al
 * contratar este producto (catálogo `SPaymentFraction`), con su recargo (%)
 * y vigencia. En la cotización solo aparecen las que están ACTIVAS y
 * vigentes hoy; la de menor orden es la que queda elegida por defecto.
 */
@Component({
  selector: 'app-product-payment-fractions-tab',
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
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './product-payment-fractions-tab.component.html',
})
export class ProductPaymentFractionsTabComponent implements OnInit {
  readonly product = input.required<CatalogRow>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly fractions = signal<CatalogRow[]>([]);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.buildForm();

  ngOnInit(): void {
    this.load();
  }

  private buildForm(row?: CatalogRow) {
    return this.fb.nonNullable.group({
      codPaymentFraction: [{ value: row ? this.fractionCode(row) : '', disabled: !!row }, Validators.required],
      tstInitial: [row ? this.toDateInput(row['TstInitial']) : this.today(), Validators.required],
      tstEnd: [row ? this.toDateInput(row['TstEnd']) : DEFAULT_END_DATE, Validators.required],
      porSurCharge: [row ? Number(row['PorSurCharge'] ?? 0) : 0, [Validators.required, Validators.min(0), Validators.max(100)]],
    });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private toDateInput(value: unknown): string {
    return value ? String(value).slice(0, 10) : '';
  }

  private fractionCode(row: CatalogRow): string {
    const rel = row['SPaymentFraction'] as Record<string, unknown> | undefined;
    return rel ? String(rel['CodPaymentFraction'] ?? '') : '';
  }

  fractionName(row: CatalogRow): string {
    const rel = row['SPaymentFraction'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesPaymentFraction'] ?? '') : this.transloco.translate('common.dash');
  }

  fractionCount(row: CatalogRow): string {
    const rel = row['SPaymentFraction'] as Record<string, unknown> | undefined;
    return rel ? String(rel['NumFraction'] ?? '') : '';
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(PATH, { codProduct: String(this.product()['CodProduct']) }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('products.productPaymentFractions.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  private loadOptions(): void {
    this.catalogService.list(FRACTIONS_PATH).subscribe({
      next: (rows) => this.fractions.set(rows.filter((r) => r.SState?.CodState === 'ACTIVO')),
    });
  }

  /** Fracciones del catálogo que este producto todavía no tiene (al crear). */
  availableFractions(): CatalogRow[] {
    const used = new Set(this.rows().map((r) => this.fractionCode(r)));
    return this.fractions().filter((f) => !used.has(String(f['CodPaymentFraction'])));
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.loadOptions();
    this.form = this.buildForm();
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.form = this.buildForm(row);
    this.dialogVisible.set(true);
  }

  /** Fila en edición (para mostrar el nombre de la fracción, que no se cambia). */
  editingRowForDisplay(): CatalogRow {
    return this.editingRow ?? {};
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
    if (raw.tstEnd < raw.tstInitial) {
      this.messages.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('products.productPaymentFractions.rangeError'),
      });
      return;
    }

    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, {
          codProduct: this.product()['CodProduct'],
          codPaymentFraction: raw.codPaymentFraction,
          tstInitial: raw.tstInitial,
          tstEnd: raw.tstEnd,
          porSurCharge: raw.porSurCharge,
        })
        .subscribe({
          next: () => this.saved('products.productPaymentFractions.createdDetail'),
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeProductPaymentFraction']);
      this.catalogService
        .update(PATH, id, { tstInitial: raw.tstInitial, tstEnd: raw.tstEnd, porSurCharge: raw.porSurCharge })
        .subscribe({
          next: () => this.saved('products.productPaymentFractions.updatedDetail'),
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    }
  }

  private saved(detailKey: string): void {
    this.messages.add({
      severity: 'success',
      summary: this.transloco.translate('common.done'),
      detail: this.transloco.translate(detailKey),
    });
    this.closeDialog();
    this.load();
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(
          nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
        ),
        item: this.fractionName(row),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeProductPaymentFraction']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
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

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
