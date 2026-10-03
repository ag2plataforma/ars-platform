import { Component, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
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

const PATH = '/product-rating/coverage-guarantees';
const PLAN_PRODUCT_RISKS_PATH = '/product-rating/plan-product-risks';
const COVERAGE_PLANS_PATH = '/product-rating/coverage-plans';
const GUARANTEES_PATH = '/reference-data/guarantees';
const DEDUCTIBLE_TYPES_PATH = '/product-rating/deductible-types';
const LIMIT_TYPES_PATH = '/product-rating/limit-types';

/** `SCoverageGuarantee` -- las garantías (`SGuarantee`) configuradas para
 * una cobertura de plan concreta (deducible, límite y máximo de usos por
 * vigencia -- ver el doc-comment de `GuaranteeProvisionsService` en
 * `claims-service`, que ya consume esta tabla desde Siniestros Etapa 2
 * pero sin ningún CRUD hasta esta pantalla, agregada 2026-09-27 al
 * cerrar ese pendiente chico). Requiere siempre un `SCoveragePlan`
 * exacto (`ideCoveragePlan` NOT NULL en BD), así que reutiliza la misma
 * cascada Plan × Riesgo → Cobertura del plan que `CalculationRulesTabComponent`. */
@Component({
  selector: 'app-coverage-guarantees-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
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
  templateUrl: './coverage-guarantees-tab.component.html',
})
export class CoverageGuaranteesTabComponent {
  readonly product = input.required<CatalogRow>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly planProductRisks = signal<CatalogRow[]>([]);
  readonly selectedPlanProductRiskId = signal<string>('');
  readonly coveragePlans = signal<CatalogRow[]>([]);
  readonly selectedCoveragePlanId = signal<string>('');
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);

  readonly guarantees = signal<CatalogRow[]>([]);
  readonly deductibleTypes = signal<CatalogRow[]>([]);
  readonly limitTypes = signal<CatalogRow[]>([]);

  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.buildForm();

  constructor() {
    this.loadPlanProductRisks();
  }

  /** Se vuelve a pedir cada vez que el usuario abre el desplegable
   *  (`(onShow)` en el template, mismo criterio ya usado en
   *  `SiteMapRolesTabComponent`/`ApplicationRolesTabComponent`) -- si
   *  crea un Plan x Riesgo nuevo en la pestaña "Plan x Riesgo" (sibling,
   *  las 7 pestañas de `ProductsComponent` se montan todas juntas) y
   *  vuelve acá sin recargar la página, la lista pedida solo en el
   *  `constructor` quedaría desactualizada (bug reportado y confirmado
   *  por el usuario, 2026-09-29). Pública por eso mismo, ya no `private`. */

  planProductRiskLabel(row: CatalogRow): string {
    const plan = row['SPlanProduct'] as Record<string, unknown> | undefined;
    const riskProduct = row['SRiskProduct'] as Record<string, unknown> | undefined;
    const risk = riskProduct?.['SRisk'] as Record<string, unknown> | undefined;
    const dash = this.transloco.translate<string>('common.dash');
    return `${plan ? String(plan['DesPlanProduct'] ?? '') : dash} / ${risk ? String(risk['DesRisk'] ?? '') : dash}`;
  }

  coveragePlanLabel(row: CatalogRow): string {
    const coverage = row['SCoverage'] as Record<string, unknown> | undefined;
    const dash = this.transloco.translate<string>('common.dash');
    return coverage ? String(coverage['DesCoverage'] ?? '') : dash;
  }

  guaranteeLabel(row: CatalogRow): string {
    const guarantee = row['SGuarantee'] as Record<string, unknown> | undefined;
    const dash = this.transloco.translate<string>('common.dash');
    const desShort = row['DesShort'] ? String(row['DesShort']) : '';
    if (desShort) return desShort;
    return guarantee ? String(guarantee['DesGuarantee'] ?? '') : dash;
  }

  loadPlanProductRisks(): void {
    this.catalogService.list(PLAN_PRODUCT_RISKS_PATH).subscribe({
      next: (all) => {
        const codProduct = this.product()['CodProduct'];
        this.planProductRisks.set(
          all.filter((r) => {
            const plan = r['SPlanProduct'] as Record<string, unknown> | undefined;
            const planProduct = plan?.['SProduct'] as Record<string, unknown> | undefined;
            return planProduct?.['CodProduct'] === codProduct;
          }),
        );
      },
    });
  }

  onSelectPlanProductRisk(id: string | null): void {
    this.selectedPlanProductRiskId.set(id ?? '');
    this.selectedCoveragePlanId.set('');
    this.rows.set([]);
    if (!id) {
      this.coveragePlans.set([]);
      return;
    }
    this.loadCoveragePlanOptions(id);
  }

  /** Extraído de `onSelectPlanProductRisk` para poder pedirlo de nuevo
   *  desde `(onShow)` del segundo desplegable sin cambiar la selección
   *  -- mismo motivo que `loadPlanProductRisks` (bug reportado y
   *  confirmado por el usuario, 2026-09-29): si se crea una cobertura
   *  nueva en la pestaña "Coverage Plans" (sibling) mientras este
   *  Plan x Riesgo ya está elegido acá, la lista pedida una sola vez en
   *  `onSelectPlanProductRisk` quedaría desactualizada. */
  private loadCoveragePlanOptions(idePlanProductRisk: string): void {
    this.catalogService.list(COVERAGE_PLANS_PATH, { idePlanProductRisk }).subscribe({
      next: (rows) => this.coveragePlans.set(rows),
    });
  }

  reloadCoveragePlanOptions(): void {
    const id = this.selectedPlanProductRiskId();
    if (id) this.loadCoveragePlanOptions(id);
  }

  onSelectCoveragePlan(id: string | null): void {
    this.selectedCoveragePlanId.set(id ?? '');
    if (id) this.load(id);
    else this.rows.set([]);
  }

  private load(ideCoveragePlan: string): void {
    this.loading.set(true);
    this.catalogService.list(PATH, { ideCoveragePlan }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate<string>('common.error'),
          detail: this.transloco.translate<string>('products.coverageGuarantees.loadErrorDetail'),
        });
      },
    });
  }

  private loadOptions(): void {
    this.catalogService.list(GUARANTEES_PATH).subscribe({ next: (rows) => this.guarantees.set(rows) });
    this.catalogService.list(DEDUCTIBLE_TYPES_PATH).subscribe({ next: (rows) => this.deductibleTypes.set(rows) });
    this.catalogService.list(LIMIT_TYPES_PATH).subscribe({ next: (rows) => this.limitTypes.set(rows) });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
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
      codGuarantee: [this.relCode(row, 'SGuarantee', 'CodGuarantee'), Validators.required],
      desShort: [row ? String(row['DesShort'] ?? '') : ''],
      desLarge: [row ? String(row['DesLarge'] ?? '') : ''],
      tstInitial: [row ? this.toDateInput(row['TstInitial']) : '', Validators.required],
      tstEnd: [row ? this.toDateInput(row['TstEnd']) : ''],
      indCoverageAccumulate: [row ? Boolean(row['IndCoverageAccumulate']) : false],
      codDeductibleType: [this.relCode(row, 'SDeductibleType', 'CodDeductibleType'), Validators.required],
      deductibleTypeValue: [row ? (row['DeductibleTypeValue'] != null ? Number(row['DeductibleTypeValue']) : null) : null],
      codLimitType: [this.relCode(row, 'SLimitType', 'CodLimitType'), Validators.required],
      limitTypeValue: [row ? (row['LimitTypeValue'] != null ? Number(row['LimitTypeValue']) : null) : null],
      numApplyUse: [row ? (row['NumApplyUse'] != null ? Number(row['NumApplyUse']) : null) : null],
      order: [row ? (row['Order'] != null ? Number(row['Order']) : null) : null],
    });
  }

  openCreate(): void {
    if (!this.selectedCoveragePlanId()) return;
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
    if (raw.numApplyUse === null) delete body['numApplyUse'];
    if (raw.order === null) delete body['order'];
    if (!raw.tstEnd) delete body['tstEnd'];

    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, { ideCoveragePlan: this.selectedCoveragePlanId(), ...body })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate<string>('common.done'),
              detail: this.transloco.translate<string>('products.coverageGuarantees.createdDetail'),
            });
            this.closeDialog();
            this.load(this.selectedCoveragePlanId());
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeCoverageGuarantee']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate<string>('common.done'),
            detail: this.transloco.translate<string>('products.coverageGuarantees.updatedDetail'),
          });
          this.closeDialog();
          this.load(this.selectedCoveragePlanId());
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    this.confirm.confirm({
      header: this.transloco.translate<string>(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate<string>('catalogs.toggleConfirm', {
        action: this.transloco.translate<string>(
          nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
        ),
        item: this.guaranteeLabel(row),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeCoverageGuarantee']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate<string>('common.done'),
              detail: this.transloco.translate<string>('common.stateUpdated'),
            });
            this.load(this.selectedCoveragePlanId());
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
    this.messages.add({ severity: 'error', summary: this.transloco.translate<string>('common.error'), detail });
  }
}
