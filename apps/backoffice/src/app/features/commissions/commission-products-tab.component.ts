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
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/party/commission-products';
const PRODUCTS_PATH = '/product-rating/products';
const CHANNELS_PATH = '/party/distribution-channels';

/**
 * `SCommissionProduct` -- split de comisión de un producto entre el canal
 * de ORIGEN (el de la cotización) y uno o más de DESTINO. Sin Cod/Des
 * propio. A diferencia de `SCommission`, esta tabla NO versiona a
 * propósito (decisión explícita del usuario, ver `commission-products.service.ts`):
 * `update()` edita en el lugar, `NumMovement` queda fijo en 1 -- porque
 * `FContractDistributionChannel` toma TODAS las filas Activas que
 * matcheen (producto, canal origen) sin filtrar por vigencia, y dos filas
 * Activas para el mismo combo duplicarían el split en el contrato. Por
 * eso `codProduct`/`codDistributionChannelOrigin`/`codDistributionChannelDestiny`
 * son inmutables en edición (igual que en Comisiones) -- cambiarlos mueve
 * la identidad de la fila, para eso se crea una nueva.
 */
@Component({
  selector: 'app-commission-products-tab',
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
    SelectModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './commission-products-tab.component.html',
})
export class CommissionProductsTabComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly products = signal<CatalogRow[]>([]);
  readonly channels = signal<CatalogRow[]>([]);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.fb.nonNullable.group({
    codProduct: ['', Validators.required],
    codDistributionChannelOrigin: ['', Validators.required],
    codDistributionChannelDestiny: ['', Validators.required],
    percentaje: [100, [Validators.required, Validators.min(0.01)]],
    indMain: [true as boolean],
    tstInitial: ['', Validators.required],
    tstEnd: ['', Validators.required],
  });

  constructor() {
    this.loadDependents();
    this.load();
  }

  private loadDependents(): void {
    this.catalogService.list(PRODUCTS_PATH).subscribe({
      next: (rows) => this.products.set(rows),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.products.loadProductsErrorDetail'),
        }),
    });
    this.catalogService.list(CHANNELS_PATH).subscribe({
      next: (rows) => this.channels.set(rows),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.products.loadChannelsErrorDetail'),
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
          detail: this.transloco.translate('commissions.products.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  productName(row: CatalogRow): string {
    const product = row['SProduct'] as CatalogRow | undefined;
    return product ? String(product['DesProduct'] ?? '') : this.transloco.translate('commissions.noProductFallback');
  }

  channelName(ideChannel: unknown): string {
    const channel = this.channels().find((c) => c['IdeDistributionChannel'] === ideChannel);
    return channel ? String(channel['DesDistributionChannel'] ?? '') : this.transloco.translate('commissions.noChannelFallback');
  }

  originChannelName(row: CatalogRow): string {
    return this.channelName(row['IdeDistributionChannelOrigin']);
  }

  destinyChannelName(row: CatalogRow): string {
    return this.channelName(row['IdeDistributionChannelDestiny']);
  }

  formatDate(value: unknown): string {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  private productCode(row: CatalogRow): string {
    const product = row['SProduct'] as CatalogRow | undefined;
    return product ? String(product['CodProduct'] ?? '') : '';
  }

  private channelCode(ideChannel: unknown): string {
    const channel = this.channels().find((c) => c['IdeDistributionChannel'] === ideChannel);
    return channel ? String(channel['CodDistributionChannel'] ?? '') : '';
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.loadDependents();
    this.form = this.fb.nonNullable.group({
      codProduct: ['', Validators.required],
      codDistributionChannelOrigin: ['', Validators.required],
      codDistributionChannelDestiny: ['', Validators.required],
      percentaje: [100, [Validators.required, Validators.min(0.01)]],
      indMain: [true as boolean],
      tstInitial: ['', Validators.required],
      tstEnd: ['', Validators.required],
    });
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.loadDependents();
    this.form = this.fb.nonNullable.group({
      codProduct: [{ value: this.productCode(row), disabled: true }],
      codDistributionChannelOrigin: [{ value: this.channelCode(row['IdeDistributionChannelOrigin']), disabled: true }],
      codDistributionChannelDestiny: [{ value: this.channelCode(row['IdeDistributionChannelDestiny']), disabled: true }],
      percentaje: [Number(row['Percentaje'] ?? 0), [Validators.required, Validators.min(0.01)]],
      indMain: [Boolean(row['IndMain'])],
      tstInitial: [this.formatDate(row['TstInitial']), Validators.required],
      tstEnd: [this.formatDate(row['TstEnd']), Validators.required],
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

    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, {
          codProduct: raw.codProduct,
          codDistributionChannelOrigin: raw.codDistributionChannelOrigin,
          codDistributionChannelDestiny: raw.codDistributionChannelDestiny,
          percentaje: raw.percentaje,
          indMain: raw.indMain,
          tstInitial: raw.tstInitial,
          tstEnd: raw.tstEnd,
        })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('commissions.products.savedDetail'),
            });
            this.closeDialog();
            this.load();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeCommissionProduct']);
      this.catalogService
        .update(PATH, id, { percentaje: raw.percentaje, indMain: raw.indMain, tstInitial: raw.tstInitial, tstEnd: raw.tstEnd })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('commissions.products.savedDetail'),
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
        item: this.productName(row),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeCommissionProduct']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('commissions.products.toggledDetail'),
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
