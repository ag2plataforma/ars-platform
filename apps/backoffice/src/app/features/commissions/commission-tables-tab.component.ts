import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/party/commission-tables';
const TREES_PATH = '/party/commission-trees';
const PRODUCTS_PATH = '/product-rating/products';

/**
 * `SCommissionTable` -- qué producto paga comisión dentro de un árbol
 * (`SCommissionTree`). El backend real permite acotar a un plan/cobertura
 * puntual vía `IdePlanProductRisk`/`IdeCoveragePlan` (comodín si van en
 * NULL), pero esos dos campos no tienen catálogo/código propio en ningún
 * lado del sistema -- se dejan fuera de este formulario v1 (siempre se
 * crea como comodín, aplica a TODO el producto), documentado en el
 * roadmap como simplificación deliberada, ver docs/02-roadmap.md.
 *
 * `SCommissionTable` SÍ incluye `SCommissionTree` (con su Cod/Des) en el
 * include del backend, así que la columna "Árbol" no necesita lookup
 * manual -- pero el producto (`IdeProduct` crudo, sin relación incluida)
 * sí necesita resolverse a mano contra el catálogo de productos ya
 * cargado, mismo criterio que `channelName` en la pestaña Árboles.
 */
@Component({
  selector: 'app-commission-tables-tab',
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
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './commission-tables-tab.component.html',
})
export class CommissionTablesTabComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly trees = signal<CatalogRow[]>([]);
  readonly products = signal<CatalogRow[]>([]);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.fb.nonNullable.group({
    cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
    des: ['', Validators.required],
    codCommissionTree: ['', Validators.required],
    codProduct: ['', Validators.required],
  });

  constructor() {
    this.loadDependents();
    this.load();
  }

  private loadDependents(): void {
    this.catalogService.list(TREES_PATH).subscribe({
      next: (rows) => this.trees.set(rows),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.tables.loadTreesErrorDetail'),
        }),
    });
    this.catalogService.list(PRODUCTS_PATH).subscribe({
      next: (rows) => this.products.set(rows),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.tables.loadProductsErrorDetail'),
        }),
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
          detail: this.transloco.translate('commissions.tables.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  treeName(row: CatalogRow): string {
    const tree = row['SCommissionTree'] as CatalogRow | undefined;
    return tree ? String(tree['DesCommissionTree'] ?? '') : this.transloco.translate('commissions.noTreeFallback');
  }

  productName(row: CatalogRow): string {
    const ideProduct = row['IdeProduct'];
    const product = this.products().find((p) => p['IdeProduct'] === ideProduct);
    return product ? String(product['DesProduct'] ?? '') : this.transloco.translate('commissions.noProductFallback');
  }

  private treeCode(row: CatalogRow): string {
    const tree = row['SCommissionTree'] as CatalogRow | undefined;
    return tree ? String(tree['CodCommissionTree'] ?? '') : '';
  }

  private productCode(row: CatalogRow): string {
    const ideProduct = row['IdeProduct'];
    const product = this.products().find((p) => p['IdeProduct'] === ideProduct);
    return product ? String(product['CodProduct'] ?? '') : '';
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.loadDependents();
    this.form = this.fb.nonNullable.group({
      cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      des: ['', Validators.required],
      codCommissionTree: ['', Validators.required],
      codProduct: ['', Validators.required],
    });
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.loadDependents();
    this.form = this.fb.nonNullable.group({
      cod: [{ value: String(row['CodCommissionTable'] ?? ''), disabled: true }],
      des: [String(row['DesCommissionTable'] ?? ''), Validators.required],
      codCommissionTree: [this.treeCode(row), Validators.required],
      codProduct: [this.productCode(row), Validators.required],
    });
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
      codCommissionTree: raw.codCommissionTree,
      codProduct: raw.codProduct,
      desCommissionTable: raw.des,
    };

    if (this.dialogMode() === 'create') {
      this.catalogService.create(PATH, { codCommissionTable: raw.cod, ...body }).subscribe({
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
      const id = String(this.editingRow!['IdeCommissionTable']);
      this.catalogService.update(PATH, id, body).subscribe({
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
    const desc = String(row['DesCommissionTable'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeCommissionTable']);
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
