import { Component, inject, signal } from '@angular/core';
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
import { TabsModule } from 'primeng/tabs';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { RiskProductsTabComponent } from './risk-products-tab.component';
import { PlanProductsTabComponent } from './plan-products-tab.component';
import { PlanProductRisksTabComponent } from './plan-product-risks-tab.component';
import { CoveragePlansTabComponent } from './coverage-plans-tab.component';
import { CalculationRulesTabComponent } from './calculation-rules-tab.component';

const PRODUCTS_PATH = '/product-rating/products';
const INSURANCE_AREAS_PATH = '/product-rating/insurance-areas';
const CURRENCIES_PATH = '/product-rating/currencies';

/**
 * "Productos" (fase "Catálogos de producto", ver docs/02-roadmap.md):
 * pantalla maestro-detalle -- una tabla de `SProduct` arriba, y al elegir
 * "Configurar" en una fila se abre debajo el detalle con sub-pestañas
 * para armar toda su jerarquía (`SRiskProduct`, `SPlanProduct`,
 * `SPlanProductRisk`, `SCoveragePlan`, `SCalculationRule`), cada una con
 * el producto elegido como contexto. Estructura explícitamente pedida
 * por el usuario (catálogos aparte + productos maestro-detalle) en vez
 * de una mega-página de tabs plana, dada la jerarquía profunda del
 * dominio (ver el README de product-rating-service).
 */
@Component({
  selector: 'app-products',
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
    TabsModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
    RiskProductsTabComponent,
    PlanProductsTabComponent,
    PlanProductRisksTabComponent,
    CoveragePlansTabComponent,
    CalculationRulesTabComponent,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './products.component.html',
})
export class ProductsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  readonly insuranceAreas = signal<CatalogRow[]>([]);
  readonly currencies = signal<CatalogRow[]>([]);

  readonly selectedProduct = signal<CatalogRow | null>(null);
  readonly activeChildTab = signal<string | number>('risk-products');

  form = this.buildForm();

  constructor() {
    this.load();
  }

  private buildForm(row?: CatalogRow) {
    return this.fb.nonNullable.group({
      cod: [
        { value: row ? String(row['CodProduct'] ?? '') : '', disabled: !!row },
        [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)],
      ],
      des: [row ? String(row['DesProduct'] ?? '') : '', Validators.required],
      desShort: [row ? String(row['DesShort'] ?? '') : ''],
      desLarge: [row ? String(row['DesLarge'] ?? '') : ''],
      codInsuranceArea: [this.relCode(row, 'SInsuranceArea', 'CodInsuranceArea'), Validators.required],
      codCurrency: [this.relCode(row, 'SCurrency', 'CodCurrency'), Validators.required],
      codStartTime: [row ? String(row['CodStartTime'] ?? '') : '', Validators.required],
      validityDays: [row ? Number(row['ValidityDays'] ?? 0) || null : null],
      indGenerateAllFraction: [row ? Boolean(row['IndGenerateAllFraction']) : false],
      indProportionalPrime: [row ? Boolean(row['IndProportionalPrime'] ?? true) : true],
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
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  private loadOptions(): void {
    this.catalogService.list(INSURANCE_AREAS_PATH).subscribe({ next: (rows) => this.insuranceAreas.set(rows) });
    this.catalogService.list(CURRENCIES_PATH).subscribe({ next: (rows) => this.currencies.set(rows) });
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(PRODUCTS_PATH).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        // Si el producto seleccionado sigue en la lista, refrescamos su
        // referencia (por si se editó); si ya no está, se deselecciona.
        const current = this.selectedProduct();
        if (current) {
          const fresh = rows.find((r) => r['IdeProduct'] === current['IdeProduct']);
          this.selectedProduct.set(fresh ?? null);
        }
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('products.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  areaName(row: CatalogRow): string {
    const rel = row['SInsuranceArea'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesInsuranceArea'] ?? '') : this.transloco.translate('common.dash');
  }

  currencyName(row: CatalogRow): string {
    const rel = row['SCurrency'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesCurrency'] ?? '') : this.transloco.translate('common.dash');
  }

  configure(row: CatalogRow): void {
    this.selectedProduct.set(row);
    this.activeChildTab.set('risk-products');
  }

  closeDetail(): void {
    this.selectedProduct.set(null);
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
      desProduct: raw.des,
      desShort: raw.desShort,
      desLarge: raw.desLarge,
      codInsuranceArea: raw.codInsuranceArea,
      codCurrency: raw.codCurrency,
      codStartTime: raw.codStartTime,
      indGenerateAllFraction: raw.indGenerateAllFraction,
      indProportionalPrime: raw.indProportionalPrime,
      tstInitial: raw.tstInitial,
    };
    if (raw.validityDays !== null && raw.validityDays !== undefined) body['validityDays'] = raw.validityDays;
    if (raw.tstEnd) body['tstEnd'] = raw.tstEnd;

    if (this.dialogMode() === 'create') {
      this.catalogService.create(PRODUCTS_PATH, { codProduct: raw.cod, ...body }).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.createdDetail', { item: raw.des }),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdeProduct']);
      this.catalogService.update(PRODUCTS_PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.updatedDetail', { item: raw.des }),
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
    const desc = String(row['DesProduct'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(
          nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
        ),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeProduct']);
        this.catalogService.setState(PRODUCTS_PATH, id, nextState).subscribe({
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
