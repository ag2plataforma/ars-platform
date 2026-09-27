import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/reference-data/claim-approval-thresholds';
const PRODUCTS_PATH = '/product-rating/products';
const PLAN_PRODUCTS_PATH = '/product-rating/plan-products';
const RISK_PRODUCTS_PATH = '/product-rating/risk-products';
const CURRENCIES_PATH = '/product-rating/currencies';
const PLAN_PRODUCT_RISKS_PATH = '/product-rating/plan-product-risks';
const COVERAGE_PLANS_PATH = '/product-rating/coverage-plans';
const ROLES_PATH = '/iam/roles';

/** '(cualquiera)' -- mismo comodín NULL que `ProductRequirementsComponent`. */
const ANY_VALUE = '__ANY__';

/**
 * `SClaimApprovalThreshold` -- umbrales de escalamiento de aprobación de
 * siniestros (Fase 4, Etapa 2, 2026-09-24). Ver el doc-comment de
 * `CreateClaimApprovalThresholdDto` en el backend real para el análisis
 * completo del modelo.
 *
 * Cascada Plan -> Riesgo -> Cobertura idéntica a `ProductRequirementsComponent`
 * (ver su doc-comment): `codRiskProduct` es un selector puramente
 * transitorio de esta pantalla (no se guarda) que solo sirve para
 * resolver qué `SCoveragePlan` ofrecer, porque `SCoveragePlan` cuelga de
 * `SPlanProductRisk` (Plan x Riesgo), no directo de Plan. Filtrado de
 * Plan/Riesgo por Producto vía signals `computed()`, mismo patrón que
 * `ClaimTypesComponent` (los endpoints de `product-rating-service` no
 * tienen `?codProduct=`).
 */
@Component({
  selector: 'app-claim-approval-thresholds',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputNumberModule,
    SelectModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './claim-approval-thresholds.component.html',
})
export class ClaimApprovalThresholdsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly ANY_VALUE = ANY_VALUE;

  readonly products = signal<CatalogRow[]>([]);
  readonly allPlanProducts = signal<CatalogRow[]>([]);
  readonly allRiskProducts = signal<(CatalogRow & { _label: string })[]>([]);
  readonly currencies = signal<CatalogRow[]>([]);
  readonly roles = signal<CatalogRow[]>([]);
  readonly coveragePlanOptions = signal<(CatalogRow & { _label: string })[]>([]);
  readonly coveragePlanLoading = signal(false);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  private readonly selectedCodProduct = signal<string | null>(null);
  readonly planProducts = signal<CatalogRow[]>([]);
  readonly riskProducts = signal<(CatalogRow & { _label: string })[]>([]);

  form = this.newForm();

  constructor() {
    this.loadOptions();
    this.load();
  }

  private newForm() {
    const group = this.fb.nonNullable.group({
      codProduct: ['', Validators.required],
      codPlanProduct: [ANY_VALUE],
      codRiskProduct: [ANY_VALUE],
      ideCoveragePlan: [ANY_VALUE],
      codCurrency: ['', Validators.required],
      level: [1, [Validators.required, Validators.min(1)]],
      maxAmount: [null as number | null],
      codRol: ['', Validators.required],
    });
    group.controls.codProduct.valueChanges.subscribe((codProduct) => {
      this.selectedCodProduct.set(codProduct);
      this.recomputeFilteredOptions();
    });
    group.controls.codPlanProduct.valueChanges.subscribe(() => this.resolveCoveragePlanOptions());
    group.controls.codRiskProduct.valueChanges.subscribe(() => this.resolveCoveragePlanOptions());
    this.selectedCodProduct.set(group.controls.codProduct.value);
    return group;
  }

  onProductChange(): void {
    this.form.patchValue({ codPlanProduct: ANY_VALUE, codRiskProduct: ANY_VALUE, ideCoveragePlan: ANY_VALUE });
  }

  private recomputeFilteredOptions(): void {
    const codProduct = this.selectedCodProduct();
    this.planProducts.set(
      this.allPlanProducts().filter(
        (row) => (row['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === codProduct,
      ),
    );
    this.riskProducts.set(
      this.allRiskProducts().filter(
        (row) => (row['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === codProduct,
      ),
    );
  }

  private resolveCoveragePlanOptions(): void {
    const { codPlanProduct, codRiskProduct } = this.form.getRawValue();
    this.form.patchValue({ ideCoveragePlan: ANY_VALUE }, { emitEvent: false });
    this.coveragePlanOptions.set([]);
    if (codPlanProduct === ANY_VALUE || codRiskProduct === ANY_VALUE || !codPlanProduct || !codRiskProduct) {
      return;
    }
    this.coveragePlanLoading.set(true);
    this.catalogService.list(PLAN_PRODUCT_RISKS_PATH, { codPlanProduct, codRiskProduct }).subscribe({
      next: (planProductRisks) => {
        const idePlanProductRisk = planProductRisks[0]?.['IdePlanProductRisk'] as string | undefined;
        if (!idePlanProductRisk) {
          this.coveragePlanLoading.set(false);
          return;
        }
        this.catalogService.list(COVERAGE_PLANS_PATH, { idePlanProductRisk }).subscribe({
          next: (coveragePlans) => {
            this.coveragePlanOptions.set(
              coveragePlans.map((row) => {
                const coverage = row['SCoverage'] as Record<string, unknown> | undefined;
                const label = coverage?.['DesCoverage']
                  ? String(coverage['DesCoverage'])
                  : String(row['DesShort'] ?? row['IdeCoveragePlan']);
                return { ...row, _label: label };
              }),
            );
            this.coveragePlanLoading.set(false);
          },
          error: () => this.coveragePlanLoading.set(false),
        });
      },
      error: () => this.coveragePlanLoading.set(false),
    });
  }

  private loadOptions(): void {
    this.catalogService.list(PRODUCTS_PATH).subscribe({ next: (rows) => this.products.set(rows) });
    this.catalogService.list(CURRENCIES_PATH).subscribe({ next: (rows) => this.currencies.set(rows) });
    this.catalogService.list(ROLES_PATH).subscribe({ next: (rows) => this.roles.set(rows) });
    this.catalogService.list(PLAN_PRODUCTS_PATH).subscribe({
      next: (rows) => {
        this.allPlanProducts.set(rows);
        this.recomputeFilteredOptions();
      },
    });
    this.catalogService.list(RISK_PRODUCTS_PATH).subscribe({
      next: (rows) => {
        this.allRiskProducts.set(
          rows.map((row) => {
            const risk = row['SRisk'] as Record<string, unknown> | undefined;
            const desRisk = risk?.['DesRisk'] ? String(risk['DesRisk']) : String(row['DesShort'] ?? '');
            return { ...row, _label: `${row['CodRiskProduct']} - ${desRisk}` };
          }),
        );
        this.recomputeFilteredOptions();
      },
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
          detail: this.transloco.translate('claims.approvalThresholds.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  productLabel(row: CatalogRow): string {
    const product = row['SProduct'] as Record<string, unknown> | undefined;
    return String(product?.['DesProduct'] ?? '');
  }

  planProductLabel(row: CatalogRow): string {
    const planProduct = row['SPlanProduct'] as Record<string, unknown> | undefined;
    return planProduct ? String(planProduct['DesPlanProduct'] ?? '') : this.transloco.translate('requirements.assignments.anyValue');
  }

  coveragePlanLabel(row: CatalogRow): string {
    const coveragePlan = row['SCoveragePlan'] as Record<string, unknown> | undefined;
    if (!coveragePlan) return this.transloco.translate('requirements.assignments.anyValue');
    const coverage = coveragePlan['SCoverage'] as Record<string, unknown> | undefined;
    return String(coverage?.['DesCoverage'] ?? coveragePlan['DesShort'] ?? '');
  }

  currencyLabel(row: CatalogRow): string {
    const currency = row['SCurrency'] as Record<string, unknown> | undefined;
    return String(currency?.['CodCurrency'] ?? '');
  }

  rolLabel(row: CatalogRow): string {
    const rol = row['TRol'] as Record<string, unknown> | undefined;
    return String(rol?.['DesRol'] ?? '');
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.loadOptions();
    this.form = this.newForm();
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.loadOptions();
    const product = row['SProduct'] as Record<string, unknown> | undefined;
    const planProduct = row['SPlanProduct'] as Record<string, unknown> | undefined;
    const currency = row['SCurrency'] as Record<string, unknown> | undefined;
    const rol = row['TRol'] as Record<string, unknown> | undefined;
    this.form = this.newForm();
    this.form.patchValue({
      codProduct: String(product?.['CodProduct'] ?? ''),
      codPlanProduct: planProduct ? String(planProduct['CodPlanProduct'] ?? '') : ANY_VALUE,
      ideCoveragePlan: row['IdeCoveragePlan'] ? String(row['IdeCoveragePlan']) : ANY_VALUE,
      codCurrency: String(currency?.['CodCurrency'] ?? ''),
      level: Number(row['Level'] ?? 1),
      maxAmount: row['MaxAmount'] !== null && row['MaxAmount'] !== undefined ? Number(row['MaxAmount']) : null,
      codRol: String(rol?.['CodRol'] ?? ''),
    });
    if (row['IdeCoveragePlan']) {
      this.resolveCoveragePlanOptions();
    }
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
    const isCreate = this.dialogMode() === 'create';
    const empty = isCreate ? undefined : '';
    const body = {
      codProduct: raw.codProduct,
      codPlanProduct: raw.codPlanProduct === ANY_VALUE ? empty : raw.codPlanProduct,
      ideCoveragePlan: raw.ideCoveragePlan === ANY_VALUE ? empty : raw.ideCoveragePlan,
      codCurrency: raw.codCurrency,
      level: raw.level,
      maxAmount: raw.maxAmount ?? (isCreate ? undefined : null),
      codRol: raw.codRol,
    };

    if (isCreate) {
      this.catalogService.create(PATH, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('claims.approvalThresholds.createdDetail'),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdeClaimApprovalThreshold']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('claims.approvalThresholds.updatedDetail'),
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
        item: `${this.productLabel(row)} (${this.transloco.translate('claims.approvalThresholds.levelLabel')} ${row['Level']})`,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeClaimApprovalThreshold']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: this.transloco.translate('common.done'), detail: this.transloco.translate('claims.approvalThresholds.toggledDetail') });
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
