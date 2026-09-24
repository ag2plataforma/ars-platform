import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/claims/claim-types';
const PRODUCTS_PATH = '/product-rating/products';
const PLAN_PRODUCTS_PATH = '/product-rating/plan-products';
const RISK_PRODUCTS_PATH = '/product-rating/risk-products';
const COVERAGES_PATH = '/product-rating/coverages';

/** '(cualquiera)' -- mismo comodín NULL que `ProductRequirementsComponent`. */
const ANY_VALUE = '__ANY__';

/**
 * `SClaimType` -- catálogo de tipos de siniestro (Fase 4, Etapa 1,
 * 2026-09-24). Pantalla bespoke (no el `CatalogsComponent` genérico)
 * porque tiene 3 campos numéricos que el formulario genérico no sabe
 * editar todavía (`CatalogFieldType` no tiene un tipo `number`), mismo
 * criterio que `ProductRequirementsComponent`. A diferencia de esa
 * pantalla, acá los 3 selects opcionales (Plan/Riesgo/Cobertura) son
 * independientes entre sí -- no hay selección en cascada -- así que no
 * hace falta recalcular opciones al cambiar uno u otro.
 */
@Component({
  selector: 'app-claim-types',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    SelectModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TooltipModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './claim-types.component.html',
})
export class ClaimTypesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly ANY_VALUE = ANY_VALUE;

  readonly products = signal<CatalogRow[]>([]);
  /** Listas SIN filtrar -- `planProducts`/`riskProducts` (computed más
   *  abajo) las filtran por el producto elegido en el formulario, ni
   *  `/product-rating/plan-products` ni `/product-rating/risk-products`
   *  soportan un filtro `?codProduct=` en el backend todavía, así que se
   *  trae todo una vez y se filtra en el cliente. */
  readonly allPlanProducts = signal<CatalogRow[]>([]);
  readonly allRiskProducts = signal<(CatalogRow & { _label: string })[]>([]);
  readonly coverages = signal<CatalogRow[]>([]);
  /** Reactivo a los cambios (programáticos o del usuario) de `codProduct` -- ver `newForm`. */
  readonly selectedCodProduct = signal<string>('');
  readonly planProducts = computed(() =>
    this.allPlanProducts().filter((row) => (row['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === this.selectedCodProduct()),
  );
  readonly riskProducts = computed(() =>
    this.allRiskProducts().filter((row) => (row['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === this.selectedCodProduct()),
  );
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.newForm();

  constructor() {
    this.loadOptions();
    this.load();
  }

  private newForm() {
    const group = this.fb.nonNullable.group({
      codClaimType: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      desClaimType: ['', Validators.required],
      codProduct: ['', Validators.required],
      codPlanProduct: [ANY_VALUE],
      codRiskProduct: [ANY_VALUE],
      codCoverage: [ANY_VALUE],
      desShort: [''],
      desLarge: [''],
      numClaimsPerYear: [1, Validators.required],
      initialProvisionAmount: [0, Validators.required],
      numDeadLineReport: [0, Validators.required],
      order: [null as number | null],
    });
    // Reactivo tanto a la selección manual del usuario como al
    // `patchValue` de `openEdit` -- alimenta `planProducts`/`riskProducts`
    // (computed más arriba). El RESET de esos dos campos al cambiar de
    // producto va aparte, en `onProductChange` (ligado al `(onChange)`
    // del select en la plantilla, no acá) -- si se reseteara acá también
    // pisaría los valores reales que `openEdit` recién patcheó.
    group.controls.codProduct.valueChanges.subscribe((codProduct) => this.selectedCodProduct.set(codProduct));
    this.selectedCodProduct.set(group.controls.codProduct.value);
    return group;
  }

  /** Ligado al `(onChange)` (no a `formControlName`) del select de
   *  producto -- ese evento solo dispara con una selección real del
   *  usuario, nunca con un `patchValue` programático (`openEdit`), así
   *  que resetear acá los campos dependientes es seguro. */
  onProductChange(): void {
    this.form.patchValue({ codPlanProduct: ANY_VALUE, codRiskProduct: ANY_VALUE });
  }

  private loadOptions(): void {
    this.catalogService.list(PRODUCTS_PATH).subscribe({ next: (rows) => this.products.set(rows) });
    this.catalogService.list(PLAN_PRODUCTS_PATH).subscribe({ next: (rows) => this.allPlanProducts.set(rows) });
    this.catalogService.list(COVERAGES_PATH).subscribe({ next: (rows) => this.coverages.set(rows) });
    this.catalogService.list(RISK_PRODUCTS_PATH).subscribe({
      next: (rows) =>
        this.allRiskProducts.set(
          rows.map((row) => {
            const risk = row['SRisk'] as Record<string, unknown> | undefined;
            const desRisk = risk?.['DesRisk'] ? String(risk['DesRisk']) : String(row['DesShort'] ?? '');
            return { ...row, _label: `${row['CodRiskProduct']} - ${desRisk}` };
          }),
        ),
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
          detail: this.transloco.translate('claims.claimTypes.loadErrorDetail'),
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
    const riskProduct = row['SRiskProduct'] as Record<string, unknown> | undefined;
    const coverage = row['SCoverage'] as Record<string, unknown> | undefined;
    this.form = this.newForm();
    this.form.patchValue({
      codClaimType: String(row['CodClaimType'] ?? ''),
      desClaimType: String(row['DesClaimType'] ?? ''),
      codProduct: String(product?.['CodProduct'] ?? ''),
      codPlanProduct: planProduct ? String(planProduct['CodPlanProduct'] ?? '') : ANY_VALUE,
      codRiskProduct: riskProduct ? String(riskProduct['CodRiskProduct'] ?? '') : ANY_VALUE,
      codCoverage: coverage ? String(coverage['CodCoverage'] ?? '') : ANY_VALUE,
      desShort: String(row['DesShort'] ?? ''),
      desLarge: String(row['DesLarge'] ?? ''),
      numClaimsPerYear: Number(row['NumClaimsPerYear'] ?? 0),
      initialProvisionAmount: Number(row['InitialProvisionAmount'] ?? 0),
      numDeadLineReport: Number(row['NumDeadLineReport'] ?? 0),
      order: (row['Order'] as number | null) ?? null,
    });
    this.form.controls.codClaimType.disable();
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
      codClaimType: raw.codClaimType,
      desClaimType: raw.desClaimType,
      codProduct: raw.codProduct,
      codPlanProduct: raw.codPlanProduct === ANY_VALUE ? empty : raw.codPlanProduct,
      codRiskProduct: raw.codRiskProduct === ANY_VALUE ? empty : raw.codRiskProduct,
      codCoverage: raw.codCoverage === ANY_VALUE ? empty : raw.codCoverage,
      desShort: raw.desShort || undefined,
      desLarge: raw.desLarge || undefined,
      numClaimsPerYear: raw.numClaimsPerYear,
      initialProvisionAmount: raw.initialProvisionAmount,
      numDeadLineReport: raw.numDeadLineReport,
      order: raw.order ?? undefined,
    };

    if (isCreate) {
      this.catalogService.create(PATH, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.createdDetail', { item: raw.desClaimType }),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdeClaimType']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.updatedDetail', { item: raw.desClaimType }),
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
    const desc = String(row['DesClaimType'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeClaimType']);
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
