import { Component, OnInit, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/product-rating/product-validity-types';
const VALIDITY_TYPES_PATH = '/product-rating/validity-types';

/**
 * `SProductValidityType` -- tipo de vigencia del producto (catálogo `SValidityType`).
 * Es obligatorio para poder cotizar/contratar: sin un tipo ACTIVO el contrato no se genera.
 * Se usa uno por producto; para cambiarlo, se desactiva el actual y se agrega el nuevo.
 */
@Component({
  selector: 'app-product-validity-types-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    SelectModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './product-validity-types-tab.component.html',
})
export class ProductValidityTypesTabComponent implements OnInit {
  readonly product = input.required<CatalogRow>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly validityTypes = signal<CatalogRow[]>([]);
  readonly dialogVisible = signal(false);

  form = this.fb.nonNullable.group({ codValidityType: ['', Validators.required] });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(PATH, { codProduct: String(this.product()['CodProduct']) }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('products.productValidityTypes.loadErrorDetail'),
        });
      },
    });
  }

  private rel(row: CatalogRow): Record<string, unknown> | undefined {
    return row['SValidityType'] as Record<string, unknown> | undefined;
  }

  typeName(row: CatalogRow): string {
    const rel = this.rel(row);
    return rel ? String(rel['DesValidityType'] ?? '') : this.transloco.translate('common.dash');
  }

  isAnnual(row: CatalogRow): boolean {
    return this.rel(row)?.['IndAnnual'] === true;
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  /** Hay al menos un tipo activo: el producto ya se puede contratar. */
  hasActive(): boolean {
    return this.rows().some((row) => this.isActive(row));
  }

  /** Tipos del catálogo (activos) que el producto todavía no tiene. */
  availableTypes(): CatalogRow[] {
    const used = new Set(this.rows().map((r) => String(this.rel(r)?.['CodValidityType'] ?? '')));
    return this.validityTypes().filter((t) => !used.has(String(t['CodValidityType'])));
  }

  openCreate(): void {
    this.catalogService.list(VALIDITY_TYPES_PATH).subscribe({
      next: (rows) => this.validityTypes.set(rows.filter((r) => r.SState?.CodState === 'ACTIVO')),
    });
    this.form = this.fb.nonNullable.group({ codValidityType: ['', Validators.required] });
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
    this.catalogService
      .create(PATH, { codProduct: this.product()['CodProduct'], codValidityType: this.form.getRawValue().codValidityType })
      .subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.productValidityTypes.createdDetail'),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(
          nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
        ),
        item: this.typeName(row),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.catalogService.setState(PATH, String(row['IdeProductValidityType']), nextState).subscribe({
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
