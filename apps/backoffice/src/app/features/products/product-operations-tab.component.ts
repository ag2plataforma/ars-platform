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

const PATH = '/product-rating/product-operations';
const OPERATIONS_PATH = '/reference-data/operations';
const PROCESSES_PATH = '/party/processes';

interface SetupBaseResult {
  created: string[];
  existing: string[];
  skipped: { codOperation: string; reason: string }[];
}

/**
 * `SOperationProduct` -- operaciones habilitadas para el producto y proceso bajo el que corren.
 * Las base (`CONTGENE` generación de contrato, `RECEGENE` generación de recibo, `RENOVGENE`
 * renovación) son obligatorias para contratar y renovar: el botón "Configurar operaciones base"
 * crea las que falten. Las de cada endoso se crean desde la pestaña Endosos.
 */
@Component({
  selector: 'app-product-operations-tab',
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
  templateUrl: './product-operations-tab.component.html',
})
export class ProductOperationsTabComponent implements OnInit {
  readonly product = input.required<CatalogRow>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly settingUp = signal(false);
  readonly operations = signal<CatalogRow[]>([]);
  readonly processes = signal<CatalogRow[]>([]);
  readonly dialogVisible = signal(false);

  form = this.buildForm();

  ngOnInit(): void {
    this.load();
  }

  private buildForm() {
    return this.fb.nonNullable.group({
      codOperation: ['', Validators.required],
      codProcess: ['', Validators.required],
    });
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
          detail: this.transloco.translate('products.productOperations.loadErrorDetail'),
        });
      },
    });
  }

  private rel(row: CatalogRow, key: string): Record<string, unknown> | undefined {
    return row[key] as Record<string, unknown> | undefined;
  }

  operationName(row: CatalogRow): string {
    const rel = this.rel(row, 'SOperation');
    return rel ? `${rel['CodOperation']} — ${rel['DesOperation']}` : this.transloco.translate('common.dash');
  }

  processName(row: CatalogRow): string {
    const rel = this.rel(row, 'SProcess');
    return rel ? String(rel['DesProcess'] ?? rel['CodProcess'] ?? '') : this.transloco.translate('common.dash');
  }

  endorsementName(row: CatalogRow): string {
    const rel = this.rel(row, 'SProductEndorsement');
    return rel ? String(rel['DesProductEndorsement'] ?? '') : this.transloco.translate('common.dash');
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  setupBase(): void {
    this.settingUp.set(true);
    this.catalogService.create(PATH + '/setup-base', { codProduct: this.product()['CodProduct'] }).subscribe({
      next: (res) => {
        this.settingUp.set(false);
        const result = res as unknown as SetupBaseResult;
        const parts: string[] = [];
        if (result.created.length) {
          parts.push(this.transloco.translate('products.productOperations.setupCreated', { list: result.created.join(', ') }));
        }
        if (result.existing.length) {
          parts.push(this.transloco.translate('products.productOperations.setupExisting', { list: result.existing.join(', ') }));
        }
        if (result.skipped.length) {
          parts.push(
            this.transloco.translate('products.productOperations.setupSkipped', {
              list: result.skipped.map((s) => `${s.codOperation} (${s.reason})`).join('; '),
            }),
          );
        }
        this.messages.add({
          severity: result.skipped.length ? 'warn' : 'success',
          summary: this.transloco.translate('common.done'),
          detail: parts.join(' '),
          life: 10000,
        });
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.settingUp.set(false);
        this.showError(err);
      },
    });
  }

  openCreate(): void {
    this.catalogService.list(OPERATIONS_PATH).subscribe({ next: (rows) => this.operations.set(rows) });
    this.catalogService.list(PROCESSES_PATH).subscribe({ next: (rows) => this.processes.set(rows) });
    this.form = this.buildForm();
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
    this.catalogService
      .create(PATH, { codProduct: this.product()['CodProduct'], codOperation: raw.codOperation, codProcess: raw.codProcess })
      .subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.productOperations.createdDetail'),
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
        item: this.operationName(row),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.catalogService.setState(PATH, String(row['IdeOperationProduct']), nextState).subscribe({
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
