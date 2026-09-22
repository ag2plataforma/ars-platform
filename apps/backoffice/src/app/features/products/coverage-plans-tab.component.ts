import { Component, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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

const PATH = '/product-rating/coverage-plans';
const PLAN_PRODUCT_RISKS_PATH = '/product-rating/plan-product-risks';
const COVERAGES_PATH = '/product-rating/coverages';
const DEDUCTIBLE_TYPES_PATH = '/product-rating/deductible-types';
const LIMIT_TYPES_PATH = '/product-rating/limit-types';

/** `SCoveragePlan` -- la configuración de negocio de una cobertura
 * dentro de un `SPlanProductRisk` concreto (deducible, límite, rangos de
 * monto/tasa/prima, obligatoriedad, período de carencia). A diferencia
 * de las pestañas anteriores, acá el backend SÍ filtra el `GET` de
 * lista por `idePlanProductRisk` exacto, así que primero hay que elegir
 * a cuál Plan × Riesgo de este producto corresponde. Es además el nivel
 * de jerarquía que exige `SCalculationRule` (`ideCoveragePlan` NOT
 * NULL), por eso `CalculationRulesTabComponent` reutiliza el mismo
 * selector. */
@Component({
  selector: 'app-coverage-plans-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
  templateUrl: './coverage-plans-tab.component.html',
})
export class CoveragePlansTabComponent {
  readonly product = input.required<CatalogRow>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly planProductRisks = signal<CatalogRow[]>([]);
  readonly selectedPlanProductRiskId = signal<string>('');
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);

  readonly coverages = signal<CatalogRow[]>([]);
  readonly deductibleTypes = signal<CatalogRow[]>([]);
  readonly limitTypes = signal<CatalogRow[]>([]);

  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.buildForm();

  constructor() {
    this.loadPlanProductRisks();
  }

  planProductRiskLabel(row: CatalogRow): string {
    const plan = row['SPlanProduct'] as Record<string, unknown> | undefined;
    const riskProduct = row['SRiskProduct'] as Record<string, unknown> | undefined;
    const risk = riskProduct?.['SRisk'] as Record<string, unknown> | undefined;
    const dash = this.transloco.translate<string>('common.dash');
    return `${plan ? String(plan['DesPlanProduct'] ?? '') : dash} / ${risk ? String(risk['DesRisk'] ?? '') : dash}`;
  }

  private loadPlanProductRisks(): void {
    this.catalogService.list(PLAN_PRODUCT_RISKS_PATH).subscribe({
      next: (all) => {
        const codProduct = this.product()['CodProduct'];
        const filtered = all.filter((r) => {
          const plan = r['SPlanProduct'] as Record<string, unknown> | undefined;
          const planProduct = plan?.['SProduct'] as Record<string, unknown> | undefined;
          return planProduct?.['CodProduct'] === codProduct;
        });
        this.planProductRisks.set(filtered);
      },
    });
  }

  onSelectPlanProductRisk(id: string | null): void {
    this.selectedPlanProductRiskId.set(id ?? '');
    if (id) this.load(id);
    else this.rows.set([]);
  }

  private load(idePlanProductRisk: string): void {
    this.loading.set(true);
    this.catalogService.list(PATH, { idePlanProductRisk }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('products.coveragePlans.loadErrorDetail'),
        });
      },
    });
  }

  private loadOptions(): void {
    this.catalogService.list(COVERAGES_PATH).subscribe({ next: (rows) => this.coverages.set(rows) });
    this.catalogService.list(DEDUCTIBLE_TYPES_PATH).subscribe({ next: (rows) => this.deductibleTypes.set(rows) });
    this.catalogService.list(LIMIT_TYPES_PATH).subscribe({ next: (rows) => this.limitTypes.set(rows) });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  coverageName(row: CatalogRow): string {
    const rel = row['SCoverage'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesCoverage'] ?? '') : this.transloco.translate('common.dash');
  }

  private toDateInput(value: unknown): string {
    return value ? String(value).slice(0, 10) : '';
  }

  private relCode(row: CatalogRow | undefined, relation: string, codField: string): string {
    if (!row) return '';
    const rel = row[relation] as Record<string, unknown> | undefined;
    return rel ? String(rel[codField] ?? '') : '';
  }

  private buildForm(row?: CatalogRow) {
    return this.fb.nonNullable.group({
      codCoverage: [this.relCode(row, 'SCoverage', 'CodCoverage'), Validators.required],
      desShort: [row ? String(row['DesShort'] ?? '') : ''],
      desLarge: [row ? String(row['DesLarge'] ?? '') : ''],
      order: [row ? Number(row['Order'] ?? 0) : 0, Validators.required],
      indMandatory: [row ? Boolean(row['IndMandatory']) : false],
      getPrime: [row ? Boolean(row['GetPrime']) : true],
      refundPrime: [row ? Boolean(row['RefundPrime']) : false],
      proratedGetPrime: [row ? Boolean(row['ProratedGetPrime']) : false],
      proratedRefundPrime: [row ? Boolean(row['ProratedRefundPrime']) : false],
      indSplitPayment: [row ? Boolean(row['IndSplitPayment']) : false],
      indPayPerUse: [row ? Boolean(row['IndPayPerUse']) : false],
      numMonthsWaitingPeriod: [row ? Number(row['NumMonthsWaitingPeriod'] ?? 0) : 0, Validators.required],
      codDeductibleType: [this.relCode(row, 'SDeductibleType', 'CodDeductibleType'), Validators.required],
      deductibleTypeValue: [row ? (row['DeductibleTypeValue'] != null ? Number(row['DeductibleTypeValue']) : null) : null],
      codLimitType: [this.relCode(row, 'SLimitType', 'CodLimitType'), Validators.required],
      limitTypeValue: [row ? (row['LimitTypeValue'] != null ? Number(row['LimitTypeValue']) : null) : null],
      indFixedAmount: [row ? Boolean(row['IndFixedAmount']) : false],
      lowerAmount: [row ? Number(row['LowerAmount'] ?? 0) : 0, Validators.required],
      upperAmount: [row ? Number(row['UpperAmount'] ?? 0) : 0, Validators.required],
      indFixedRate: [row ? Boolean(row['IndFixedRate']) : false],
      lowerRate: [row ? Number(row['LowerRate'] ?? 0) : 0, Validators.required],
      upperRate: [row ? Number(row['UpperRate'] ?? 0) : 0, Validators.required],
      indFixedPrime: [row ? Boolean(row['IndFixedPrime']) : false],
      lowerPrime: [row ? Number(row['LowerPrime'] ?? 0) : 0, Validators.required],
      upperPrime: [row ? Number(row['UpperPrime'] ?? 0) : 0, Validators.required],
      tstInitial: [row ? this.toDateInput(row['TstInitial']) : '', Validators.required],
      tstEnd: [row ? this.toDateInput(row['TstEnd']) : ''],
    });
  }

  openCreate(): void {
    if (!this.selectedPlanProductRiskId()) return;
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
    const body: Record<string, unknown> = { ...raw };
    if (raw.deductibleTypeValue === null) delete body['deductibleTypeValue'];
    if (raw.limitTypeValue === null) delete body['limitTypeValue'];
    if (!raw.tstEnd) delete body['tstEnd'];

    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, { idePlanProductRisk: this.selectedPlanProductRiskId(), ...body })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('products.coveragePlans.createdDetail'),
            });
            this.closeDialog();
            this.load(this.selectedPlanProductRiskId());
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeCoveragePlan']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.coveragePlans.updatedDetail'),
          });
          this.closeDialog();
          this.load(this.selectedPlanProductRiskId());
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
        item: this.coverageName(row),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeCoveragePlan']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('common.stateUpdated'),
            });
            this.load(this.selectedPlanProductRiskId());
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
