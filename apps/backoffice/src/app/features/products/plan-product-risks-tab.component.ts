import { Component, inject, input, signal } from '@angular/core';
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

const PATH = '/product-rating/plan-product-risks';
const PLAN_PRODUCTS_PATH = '/product-rating/plan-products';
const RISK_PRODUCTS_PATH = '/product-rating/risk-products';

/** `SPlanProductRisk` -- qué riesgos de producto cubre cada plan del
 * producto elegido. Tabla de unión sin `Cod`/`Des` propios; el backend
 * sí filtra el `GET` de lista por `codPlanProduct`/`codRiskProduct`,
 * pero no por producto directamente, así que se trae todo y se filtra
 * client-side por la relación anidada `SPlanProduct.SProduct.CodProduct`.
 * A diferencia del resto, `TstEnd` es obligatorio acá (columna NOT NULL
 * en la BD, ver `create-plan-product-risk.dto.ts`). */
@Component({
  selector: 'app-plan-product-risks-tab',
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
  templateUrl: './plan-product-risks-tab.component.html',
})
export class PlanProductRisksTabComponent {
  readonly product = input.required<CatalogRow>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly planProducts = signal<CatalogRow[]>([]);
  readonly riskProducts = signal<CatalogRow[]>([]);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.buildForm();

  constructor() {
    this.load();
  }

  private buildForm(row?: CatalogRow) {
    return this.fb.nonNullable.group({
      codPlanProduct: [this.relCode(row, 'SPlanProduct', 'CodPlanProduct'), Validators.required],
      codRiskProduct: [this.relCode(row, 'SRiskProduct', 'CodRiskProduct'), Validators.required],
      tstInitial: [row ? this.toDateInput(row['TstInitial']) : '', Validators.required],
      tstEnd: [row ? this.toDateInput(row['TstEnd']) : '', Validators.required],
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

  private codProduct(): unknown {
    return this.product()['CodProduct'];
  }

  private loadOptions(): void {
    const codProduct = this.codProduct();
    this.catalogService.list(PLAN_PRODUCTS_PATH).subscribe({
      next: (all) =>
        this.planProducts.set(
          all.filter((r) => (r['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === codProduct),
        ),
    });
    this.catalogService.list(RISK_PRODUCTS_PATH).subscribe({
      next: (all) =>
        this.riskProducts.set(
          all.filter((r) => (r['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === codProduct),
        ),
    });
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(PATH).subscribe({
      next: (all) => {
        const codProduct = this.codProduct();
        this.rows.set(
          all.filter((r) => {
            const plan = r['SPlanProduct'] as Record<string, unknown> | undefined;
            const planProduct = plan?.['SProduct'] as Record<string, unknown> | undefined;
            return planProduct?.['CodProduct'] === codProduct;
          }),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('products.planProductRisks.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  planName(row: CatalogRow): string {
    const rel = row['SPlanProduct'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesPlanProduct'] ?? '') : this.transloco.translate('common.dash');
  }

  riskProductLabel(row: CatalogRow): string {
    const rel = row['SRiskProduct'] as Record<string, unknown> | undefined;
    if (!rel) return this.transloco.translate('common.dash');
    const risk = rel['SRisk'] as Record<string, unknown> | undefined;
    return `${String(rel['CodRiskProduct'] ?? '')} — ${risk ? String(risk['DesRisk'] ?? '') : ''}`;
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
    const body = {
      codPlanProduct: raw.codPlanProduct,
      codRiskProduct: raw.codRiskProduct,
      tstInitial: raw.tstInitial,
      tstEnd: raw.tstEnd,
    };

    if (this.dialogMode() === 'create') {
      this.catalogService.create(PATH, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.planProductRisks.createdDetail'),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdePlanProductRisk']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.planProductRisks.updatedDetail'),
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
      message: this.transloco.translate('products.planProductRisks.toggleConfirm', {
        action: this.transloco.translate(
          nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
        ),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdePlanProductRisk']);
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
