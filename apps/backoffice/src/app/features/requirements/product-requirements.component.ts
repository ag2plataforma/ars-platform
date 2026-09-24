import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/reference-data/product-requirements';
const PROCESSES_PATH = '/party/processes';
const PRODUCTS_PATH = '/product-rating/products';
const PLAN_PRODUCTS_PATH = '/product-rating/plan-products';
const RISK_PRODUCTS_PATH = '/product-rating/risk-products';
const REQUIREMENTS_PATH = '/reference-data/requirements';
const PLAN_PRODUCT_RISKS_PATH = '/product-rating/plan-product-risks';
const COVERAGE_PLANS_PATH = '/product-rating/coverage-plans';

/** '(cualquiera)' -- mismo comodín NULL que `ProductProcessFlowsComponent`
 * (ver su doc-comment) para los campos opcionales de alcance
 * (`codPlanProduct`/`codRiskProduct`/`ideCoveragePlan`). */
const ANY_VALUE = '__ANY__';

/**
 * `SProductRequirement` -- CONFIGURACIÓN de qué documentos exige un
 * producto (feature "Requisitos", 2026-09-24, ver el doc-comment de
 * `ProductRequirementService` en `reference-data-service` para el
 * análisis completo y `RequirementsService` en `underwriting-service`
 * para cómo se resuelve contra una cotización/contrato reales -- acá
 * solo se configura, no se ejecuta nada).
 *
 * `ideCoveragePlan` (alcance más fino: una cobertura concreta) se arma
 * con un selector en cascada Plan -> Riesgo -> Cobertura porque
 * `SCoveragePlan` no tiene código propio (ver `resolveCoveragePlanOptions`)
 * -- solo se habilita cuando Plan y Riesgo están fijados (no en
 * "cualquiera"). `codOperation` (columna real de la tabla) queda fuera
 * de este formulario por ahora: no existe ningún endpoint que liste
 * `SOperation` todavía (confirmado por búsqueda) y no hace falta para el
 * alcance acordado ("Solo Cotización/Contratación por ahora").
 */
@Component({
  selector: 'app-product-requirements',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    CheckboxModule,
    TextareaModule,
    SelectModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './product-requirements.component.html',
})
export class ProductRequirementsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly ANY_VALUE = ANY_VALUE;

  readonly processes = signal<CatalogRow[]>([]);
  readonly products = signal<CatalogRow[]>([]);
  readonly planProducts = signal<CatalogRow[]>([]);
  readonly riskProducts = signal<(CatalogRow & { _label: string })[]>([]);
  readonly requirements = signal<CatalogRow[]>([]);
  readonly coveragePlanOptions = signal<(CatalogRow & { _label: string })[]>([]);
  readonly coveragePlanLoading = signal(false);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.newForm();

  constructor() {
    this.loadOptions();
    this.load();
    this.form.controls.codPlanProduct.valueChanges.subscribe(() => this.resolveCoveragePlanOptions());
    this.form.controls.codRiskProduct.valueChanges.subscribe(() => this.resolveCoveragePlanOptions());
  }

  private newForm() {
    return this.fb.nonNullable.group({
      codProcess: ['', Validators.required],
      codProduct: ['', Validators.required],
      codRequirement: ['', Validators.required],
      codPlanProduct: [ANY_VALUE],
      codRiskProduct: [ANY_VALUE],
      ideCoveragePlan: [ANY_VALUE],
      desShort: [''],
      desLarge: [''],
      indMandatory: [true],
      indReviewable: [true],
      codRequirementType: ['DOCUMENTO', Validators.required],
      codDocumentType: ['PDF', Validators.required],
      indApplyOCR: [false],
      order: [null as number | null],
    });
  }

  private loadOptions(): void {
    this.catalogService.list(PROCESSES_PATH).subscribe({ next: (rows) => this.processes.set(rows) });
    this.catalogService.list(PRODUCTS_PATH).subscribe({ next: (rows) => this.products.set(rows) });
    this.catalogService.list(PLAN_PRODUCTS_PATH).subscribe({ next: (rows) => this.planProducts.set(rows) });
    this.catalogService.list(REQUIREMENTS_PATH).subscribe({ next: (rows) => this.requirements.set(rows) });
    this.catalogService.list(RISK_PRODUCTS_PATH).subscribe({
      next: (rows) =>
        this.riskProducts.set(
          rows.map((row) => {
            const risk = row['SRisk'] as Record<string, unknown> | undefined;
            const desRisk = risk?.['DesRisk'] ? String(risk['DesRisk']) : String(row['DesShort'] ?? '');
            return { ...row, _label: `${row['CodRiskProduct']} - ${desRisk}` };
          }),
        ),
    });
  }

  /** Recalcula las opciones de cobertura cuando Plan y Riesgo están
   * ambos fijados (no en "cualquiera"): busca el `SPlanProductRisk` de
   * esa combinación y lista sus `SCoveragePlan`. Si Plan o Riesgo están
   * en "cualquiera", limpia las opciones (no tiene sentido fijar una
   * cobertura sin fijar antes su plan+riesgo). */
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
          detail: this.transloco.translate('requirements.assignments.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  requirementLabel(row: CatalogRow): string {
    const requirement = row['SRequirement'] as Record<string, unknown> | undefined;
    return String(row['DesShort'] ?? requirement?.['DesRequirement'] ?? '');
  }

  riskProductLabel(row: CatalogRow): string {
    const riskProduct = row['SRiskProduct'] as Record<string, unknown> | undefined;
    return riskProduct ? String(riskProduct['CodRiskProduct'] ?? '') : this.transloco.translate('requirements.assignments.anyValue');
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
    const process = row['SProcess'] as Record<string, unknown> | undefined;
    const product = row['SProduct'] as Record<string, unknown> | undefined;
    const requirement = row['SRequirement'] as Record<string, unknown> | undefined;
    const planProduct = row['SPlanProduct'] as Record<string, unknown> | undefined;
    const riskProduct = row['SRiskProduct'] as Record<string, unknown> | undefined;
    this.form = this.newForm();
    this.form.patchValue({
      codProcess: String(process?.['CodProcess'] ?? ''),
      codProduct: String(product?.['CodProduct'] ?? ''),
      codRequirement: String(requirement?.['CodRequirement'] ?? ''),
      codPlanProduct: planProduct ? String(planProduct['CodPlanProduct'] ?? '') : ANY_VALUE,
      codRiskProduct: riskProduct ? String(riskProduct['CodRiskProduct'] ?? '') : ANY_VALUE,
      ideCoveragePlan: row['IdeCoveragePlan'] ? String(row['IdeCoveragePlan']) : ANY_VALUE,
      desShort: String(row['DesShort'] ?? ''),
      desLarge: String(row['DesLarge'] ?? ''),
      indMandatory: Boolean(row['IndMandatory']),
      indReviewable: Boolean(row['IndReviewable']),
      codRequirementType: String(row['CodRequirementType'] ?? ''),
      codDocumentType: String(row['CodDocumentType'] ?? ''),
      indApplyOCR: Boolean(row['IndApplyOCR']),
      order: (row['Order'] as number | null) ?? null,
    });
    if (row['IdeCoveragePlan']) {
      // Reconstruir opciones de cobertura para que el selector muestre la ya elegida.
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
      codProcess: raw.codProcess,
      codProduct: raw.codProduct,
      codRequirement: raw.codRequirement,
      codPlanProduct: raw.codPlanProduct === ANY_VALUE ? empty : raw.codPlanProduct,
      codRiskProduct: raw.codRiskProduct === ANY_VALUE ? empty : raw.codRiskProduct,
      ideCoveragePlan: raw.ideCoveragePlan === ANY_VALUE ? empty : raw.ideCoveragePlan,
      desShort: raw.desShort || undefined,
      desLarge: raw.desLarge || undefined,
      indMandatory: raw.indMandatory,
      indReviewable: raw.indReviewable,
      codRequirementType: raw.codRequirementType,
      codDocumentType: raw.codDocumentType,
      indApplyOCR: raw.indApplyOCR,
      order: raw.order ?? undefined,
    };

    const label = this.requirements().find((r) => r['CodRequirement'] === raw.codRequirement)?.['DesRequirement'] ?? raw.codRequirement;

    if (isCreate) {
      this.catalogService.create(PATH, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.createdDetail', { item: label }),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdeProductRequirement']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.updatedDetail', { item: label }),
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
    const desc = this.requirementLabel(row);
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeProductRequirement']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('catalogs.toggledDetail', {
                item: desc,
                state: this.transloco.translate(nextState === 'ACTIVO' ? 'common.active' : 'common.inactive').toLowerCase(),
              }),
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
