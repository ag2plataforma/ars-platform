import { Component, OnInit, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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

const PATH = '/product-rating/product-endorsements';
const ENDORSEMENTS_PATH = '/reference-data/endorsements';
const ENDORSEMENT_REASONS_PATH = '/reference-data/endorsement-reasons';
const OPERATIONS_PATH = '/reference-data/operations';
const PROCESSES_PATH = '/party/processes';

const REFUND_OPTIONS = [
  { value: 'SI', labelKey: 'common.yes' },
  { value: 'NO', labelKey: 'common.no' },
];

/**
 * `SProductEndorsement` -- configuración de los endosos/suplementos de un
 * producto (hoy, en la práctica, solo el de Anulación -- el motor
 * genérico de "Suplemento" queda para una Etapa 2 aparte, ver
 * `docs/02-roadmap.md`). Agregada 2026-09-28 (backlog priorizado, ítem 1,
 * Etapa 1): sin esta pantalla, `ContractsService.cancel()` en
 * `underwriting-service` -- que ya funciona de punta a punta -- no tenía
 * forma de configurar un endoso real más allá de la fila de prueba
 * sembrada por script.
 *
 * Mismo patrón que `RiskProductsTabComponent` (lista scopeada por
 * `IdeProduct`, sin cascada adicional) -- a diferencia de
 * `CalculationRulesTabComponent`/`CoverageGuaranteesTabComponent`, que sí
 * necesitan bajar hasta `IdeCoveragePlan`. Acá el backend SÍ filtra
 * server-side (`GET .../product-endorsements?codProduct=...`), así que no
 * hace falta filtrar client-side como en Riesgos de producto.
 */
@Component({
  selector: 'app-product-endorsements-tab',
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
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './product-endorsements-tab.component.html',
})
export class ProductEndorsementsTabComponent implements OnInit {
  readonly product = input.required<CatalogRow>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly refundOptions = REFUND_OPTIONS;
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly endorsements = signal<CatalogRow[]>([]);
  readonly endorsementReasons = signal<CatalogRow[]>([]);
  readonly operations = signal<CatalogRow[]>([]);
  readonly processes = signal<CatalogRow[]>([]);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.buildForm();

  ngOnInit(): void {
    this.load();
  }

  private buildForm(row?: CatalogRow) {
    const conditionData = (row?.['ConditionData'] as Record<string, unknown> | null) ?? {};
    return this.fb.nonNullable.group({
      cod: [
        { value: row ? String(row['CodProductEndorsement'] ?? '') : '', disabled: !!row },
        [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)],
      ],
      des: [row ? String(row['DesProductEndorsement'] ?? '') : '', Validators.required],
      codEndorsement: [
        { value: this.relCode(row, 'SEndorsement', 'CodEndorsement'), disabled: !!row },
        Validators.required,
      ],
      codEndorsementReason: [
        { value: this.relCode(row, 'SEndorsementReason', 'CodEndorsementReason'), disabled: !!row },
        Validators.required,
      ],
      codOperation: [
        { value: '', disabled: !!row },
        Validators.required,
      ],
      codProcess: [
        { value: '', disabled: !!row },
        Validators.required,
      ],
      refundPremium: [String(conditionData['refundPremium'] ?? 'NO')],
      refundCommission: [String(conditionData['refundCommission'] ?? 'NO')],
      refundTax: [String(conditionData['refundTax'] ?? 'NO')],
    });
  }

  private relCode(row: CatalogRow | undefined, relation: string, codField: string): string {
    if (!row) return '';
    const rel = row[relation] as Record<string, unknown> | undefined;
    return rel ? String(rel[codField] ?? '') : '';
  }

  private loadOptions(): void {
    this.catalogService.list(ENDORSEMENTS_PATH).subscribe({ next: (rows) => this.endorsements.set(rows) });
    this.catalogService.list(ENDORSEMENT_REASONS_PATH).subscribe({ next: (rows) => this.endorsementReasons.set(rows) });
    this.catalogService.list(OPERATIONS_PATH).subscribe({ next: (rows) => this.operations.set(rows) });
    this.catalogService.list(PROCESSES_PATH).subscribe({ next: (rows) => this.processes.set(rows) });
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
          detail: this.transloco.translate('products.productEndorsements.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  endorsementName(row: CatalogRow): string {
    const rel = row['SEndorsement'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesEndorsement'] ?? '') : this.transloco.translate('common.dash');
  }

  endorsementReasonName(row: CatalogRow): string {
    const rel = row['SEndorsementReason'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesEndorsementReason'] ?? '') : this.transloco.translate('common.dash');
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
    const conditionData = {
      refundPremium: raw.refundPremium,
      refundCommission: raw.refundCommission,
      refundTax: raw.refundTax,
    };

    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, {
          codProductEndorsement: raw.cod,
          desProductEndorsement: raw.des,
          codProduct: this.product()['CodProduct'],
          codEndorsement: raw.codEndorsement,
          codEndorsementReason: raw.codEndorsementReason,
          codOperation: raw.codOperation,
          codProcess: raw.codProcess,
          conditionData,
        })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('products.productEndorsements.createdDetail'),
            });
            this.closeDialog();
            this.load();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeProductEndorsement']);
      this.catalogService.update(PATH, id, { desProductEndorsement: raw.des, conditionData }).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.productEndorsements.updatedDetail'),
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
        action: this.transloco.translate(
          nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
        ),
        item: String(row['CodProductEndorsement']),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeProductEndorsement']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
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
