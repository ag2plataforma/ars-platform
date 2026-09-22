import { Component, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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

const PATH = '/product-rating/calculation-rules';
const PLAN_PRODUCT_RISKS_PATH = '/product-rating/plan-product-risks';
const COVERAGE_PLANS_PATH = '/product-rating/coverage-plans';
const CONCEPTS_PATH = '/reference-data/concepts';

/** `SCalculationRule` -- las fórmulas del motor de reglas (`RulesEngineService`),
 * reemplazo real de `db:seed-example-rules`. Requiere siempre un
 * `SCoveragePlan` exacto (`ideCoveragePlan`), así que primero hay que
 * elegir Plan × Riesgo y, dentro de eso, la cobertura del plan -- mismo
 * criterio en cascada que `CoveragePlansTabComponent`. `codProduct`/
 * `idePlanProductRisk` (comodines de jerarquía más amplia, ver el
 * README de product-rating-service) quedan deliberadamente afuera de
 * este formulario: alcanza con el nivel exacto de cobertura para el
 * caso de uso real (armar un producto de punta a punta), y dejarlos
 * vacíos es la opción segura (no amplía el alcance de la regla más allá
 * de lo que el usuario ve acá). */
@Component({
  selector: 'app-calculation-rules-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
  templateUrl: './calculation-rules-tab.component.html',
})
export class CalculationRulesTabComponent {
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
  readonly concepts = signal<CatalogRow[]>([]);

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
    return `${plan ? String(plan['DesPlanProduct'] ?? '') : '—'} / ${risk ? String(risk['DesRisk'] ?? '') : '—'}`;
  }

  coveragePlanLabel(row: CatalogRow): string {
    const coverage = row['SCoverage'] as Record<string, unknown> | undefined;
    return coverage ? String(coverage['DesCoverage'] ?? '') : '—';
  }

  private loadPlanProductRisks(): void {
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
    this.catalogService.list(COVERAGE_PLANS_PATH, { idePlanProductRisk: id }).subscribe({
      next: (rows) => this.coveragePlans.set(rows),
    });
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
          detail: this.transloco.translate<string>('products.calculationRules.loadErrorDetail'),
        });
      },
    });
  }

  private loadOptions(): void {
    this.catalogService.list(CONCEPTS_PATH).subscribe({ next: (rows) => this.concepts.set(rows) });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  conceptName(row: CatalogRow): string {
    const rel = row['SConcept'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesConcept'] ?? '') : '—';
  }

  private relCode(row: CatalogRow | undefined, relation: string, codField: string): string {
    if (!row) return '';
    const rel = row[relation] as Record<string, unknown> | undefined;
    return rel ? String(rel[codField] ?? '') : '';
  }

  private buildForm(row?: CatalogRow) {
    const formula = (row?.['FormulaJSON'] as { IF?: string; THEN?: string; ELSE?: string } | undefined) ?? {};
    return this.fb.nonNullable.group({
      cod: [
        { value: row ? String(row['CodCalculationRule'] ?? '') : '', disabled: !!row },
        [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)],
      ],
      des: [row ? String(row['DesCalculationRule'] ?? '') : '', Validators.required],
      codConcept: [this.relCode(row, 'SConcept', 'CodConcept'), Validators.required],
      order: [row ? Number(row['Order'] ?? 0) : 0, Validators.required],
      codEntityReference: [row ? String(row['CodEntityReference'] ?? '') : ''],
      desColumnName: [row ? String(row['DesColumnName'] ?? '') : ''],
      formulaIf: [formula.IF ?? '', Validators.required],
      formulaThen: [formula.THEN ?? '', Validators.required],
      formulaElse: [formula.ELSE ?? '', Validators.required],
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
    const body: Record<string, unknown> = {
      desCalculationRule: raw.des,
      codConcept: raw.codConcept,
      order: raw.order,
      formula: { if: raw.formulaIf, then: raw.formulaThen, else: raw.formulaElse },
    };
    if (raw.codEntityReference) body['codEntityReference'] = raw.codEntityReference;
    if (raw.desColumnName) body['desColumnName'] = raw.desColumnName;

    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, { codCalculationRule: raw.cod, ideCoveragePlan: this.selectedCoveragePlanId(), ...body })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate<string>('common.done'),
              detail: this.transloco.translate<string>('products.calculationRules.createdDetail'),
            });
            this.closeDialog();
            this.load(this.selectedCoveragePlanId());
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeCalculationRule']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate<string>('common.done'),
            detail: this.transloco.translate<string>('products.calculationRules.updatedDetail'),
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
    const desc = String(row['DesCalculationRule'] ?? '');
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
        const id = String(row['IdeCalculationRule']);
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
