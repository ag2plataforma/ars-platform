import { Component, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/product-rating/risk-products';
const RISKS_PATH = '/product-rating/risks';
const RISK_TYPES_PATH = '/product-rating/risk-types';

/** `SRiskProduct` -- qué riesgo (y de qué tipo) cubre el producto elegido
 * en `ProductsComponent`. Sin `Cod`/`Des` propios más allá del código
 * (ver su README): se filtra client-side por `SProduct.CodProduct` del
 * producto en contexto porque el backend no expone ese filtro en el
 * `GET` de lista (devuelve todos los riesgos de producto de cualquier
 * producto). */
@Component({
  selector: 'app-risk-products-tab',
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
  templateUrl: './risk-products-tab.component.html',
})
export class RiskProductsTabComponent {
  readonly product = input.required<CatalogRow>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly risks = signal<CatalogRow[]>([]);
  readonly riskTypes = signal<CatalogRow[]>([]);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.buildForm();

  constructor() {
    this.load();
  }

  private buildForm(row?: CatalogRow) {
    return this.fb.nonNullable.group({
      cod: [
        { value: row ? String(row['CodRiskProduct'] ?? '') : '', disabled: !!row },
        [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)],
      ],
      codRisk: [this.relCode(row, 'SRisk', 'CodRisk'), Validators.required],
      codRiskType: [this.relCode(row, 'SRiskType', 'CodRiskType'), Validators.required],
      desShort: [row ? String(row['DesShort'] ?? '') : ''],
      desLarge: [row ? String(row['DesLarge'] ?? '') : ''],
      tstInitial: [row ? this.toDateInput(row['TstInitial']) : '', Validators.required],
      tstEnd: [row ? this.toDateInput(row['TstEnd']) : ''],
    });
  }

  private relCode(row: CatalogRow | undefined, relation: string, codField: string): string {
    if (!row) return '';
    const rel = row[relation] as Record<string, unknown> | undefined;
    return rel ? String(rel[codField] ?? '') : '';
  }

  private toDateInput(value: unknown): string {
    return value ? String(value).slice(0, 10) : '';
  }

  private loadOptions(): void {
    this.catalogService.list(RISKS_PATH).subscribe({ next: (rows) => this.risks.set(rows) });
    this.catalogService.list(RISK_TYPES_PATH).subscribe({ next: (rows) => this.riskTypes.set(rows) });
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(PATH).subscribe({
      next: (all) => {
        const codProduct = this.product()['CodProduct'];
        this.rows.set(all.filter((r) => (r['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === codProduct));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('products.riskProducts.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  riskName(row: CatalogRow): string {
    const rel = row['SRisk'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesRisk'] ?? '') : this.transloco.translate('common.dash');
  }

  riskTypeName(row: CatalogRow): string {
    const rel = row['SRiskType'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesRiskType'] ?? '') : this.transloco.translate('common.dash');
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
    this.loadOptions();
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
    const body: Record<string, unknown> = {
      codRisk: raw.codRisk,
      codRiskType: raw.codRiskType,
      desShort: raw.desShort,
      desLarge: raw.desLarge,
      tstInitial: raw.tstInitial,
    };
    if (raw.tstEnd) body['tstEnd'] = raw.tstEnd;

    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, { codRiskProduct: raw.cod, codProduct: this.product()['CodProduct'], ...body })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('products.riskProducts.createdDetail'),
            });
            this.closeDialog();
            this.load();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeRiskProduct']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.riskProducts.updatedDetail'),
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
        action: this.transloco.translate(
          nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
        ),
        item: String(row['CodRiskProduct']),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeRiskProduct']);
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
