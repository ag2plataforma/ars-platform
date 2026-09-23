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

const PATH = '/party/commission-trees';
const CHANNELS_PATH = '/party/distribution-channels';

/**
 * `SCommissionTree` -- el árbol de comisión de UN canal de distribución.
 * `SCommissionTree` no tiene relación de Prisma hacia `SDistributionChannel`
 * (columna sin FK real, ver el comentario del backend real en
 * `commission-trees.service.ts`), así que el canal se resuelve a mano acá
 * contra el catálogo ya cargado (`channels()`), mismo criterio que
 * `enrichDistributionChannels` en `ContractsService`.
 */
@Component({
  selector: 'app-commission-trees-tab',
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
  templateUrl: './commission-trees-tab.component.html',
})
export class CommissionTreesTabComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly channels = signal<CatalogRow[]>([]);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.fb.nonNullable.group({
    cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
    des: ['', Validators.required],
    codDistributionChannel: ['', Validators.required],
  });

  constructor() {
    this.loadChannels();
    this.load();
  }

  private loadChannels(): void {
    this.catalogService.list(CHANNELS_PATH).subscribe({
      next: (rows) => this.channels.set(rows),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.trees.loadChannelsErrorDetail'),
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
          detail: this.transloco.translate('commissions.trees.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  channelName(row: CatalogRow): string {
    const ideChannel = row['IdeDistributionChannel'];
    const channel = this.channels().find((c) => c['IdeDistributionChannel'] === ideChannel);
    return channel ? String(channel['DesDistributionChannel'] ?? '') : this.transloco.translate('commissions.noChannelFallback');
  }

  private channelCode(row: CatalogRow): string {
    const ideChannel = row['IdeDistributionChannel'];
    const channel = this.channels().find((c) => c['IdeDistributionChannel'] === ideChannel);
    return channel ? String(channel['CodDistributionChannel'] ?? '') : '';
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.loadChannels();
    this.form = this.fb.nonNullable.group({
      cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      des: ['', Validators.required],
      codDistributionChannel: ['', Validators.required],
    });
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.loadChannels();
    this.form = this.fb.nonNullable.group({
      cod: [{ value: String(row['CodCommissionTree'] ?? ''), disabled: true }],
      des: [String(row['DesCommissionTree'] ?? ''), Validators.required],
      codDistributionChannel: [this.channelCode(row), Validators.required],
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
        .create(PATH, { codCommissionTree: raw.cod, desCommissionTree: raw.des, codDistributionChannel: raw.codDistributionChannel })
        .subscribe({
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
      const id = String(this.editingRow!['IdeCommissionTree']);
      this.catalogService.update(PATH, id, { desCommissionTree: raw.des, codDistributionChannel: raw.codDistributionChannel }).subscribe({
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
    const desc = String(row['DesCommissionTree'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeCommissionTree']);
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
