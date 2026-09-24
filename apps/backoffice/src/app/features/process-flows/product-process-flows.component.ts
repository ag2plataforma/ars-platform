import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
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
import { environment } from '../../../environments/environment';

const PATH = '/reference-data/product-process-flows';
const PROCESS_FLOWS_PATH = '/reference-data/process-flows';
const PRODUCTS_PATH = '/product-rating/products';
const RISK_PRODUCTS_PATH = '/product-rating/risk-products';
const DISTRIBUTION_CHANNELS_PATH = '/party/distribution-channels';
const DISTRIBUTION_WAYS_PATH = '/party/distribution-ways';

/** '(cualquiera)' -- valor de UI para el comodín NULL de un campo
 * opcional (riesgo de producto / vía de distribución), ver el
 * doc-comment de `ProcessFlowResolver` en `@ars-platform/shared-common`
 * sobre la regla de especificidad "más específica gana". Se traduce a
 * `undefined` (create) o `''` (update, que la limpia) antes de mandarla
 * al backend -- nunca se manda literal al DTO. */
const ANY_VALUE = '__ANY__';

interface ResolveStepsResult {
  codProcessFlow: string | null;
  activeSteps: string[];
}

/**
 * `SProductProcessFlow` -- asigna un `SProcessFlow` a un producto/canal
 * real (+ riesgo de producto/vía de distribución opcionales). Era la
 * única pieza sin CRUD ni pantalla de "flujos de contratación
 * configurables por producto" (pedido explícito del usuario,
 * 2026-09-23, ver el doc-comment de `ProcessFlowResolver` en
 * `@ars-platform/shared-common` para el análisis completo y el alcance
 * acordado con las 3 rondas de `AskUserQuestion`: precedencia "más
 * específica gana", solo Atributos personalizados + Impacto Social
 * (Requisitos queda afuera de esta vuelta)).
 *
 * Incluye un panel "Probar" que llama a `GET .../resolve-steps` (el
 * mismo endpoint que consume `underwriting-service` para Impacto Social
 * y que consumirá `QuotesComponent` para Atributos personalizados) para
 * que el usuario pueda verificar, antes de ir al wizard real de
 * Cotización, qué `CodStep` quedan activos para una combinación dada.
 */
@Component({
  selector: 'app-product-process-flows',
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
  templateUrl: './product-process-flows.component.html',
})
export class ProductProcessFlowsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly ANY_VALUE = ANY_VALUE;

  readonly processFlows = signal<CatalogRow[]>([]);
  readonly products = signal<CatalogRow[]>([]);
  readonly riskProducts = signal<(CatalogRow & { _label: string })[]>([]);
  readonly channels = signal<CatalogRow[]>([]);
  readonly ways = signal<CatalogRow[]>([]);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  readonly testerVisible = signal(false);
  readonly testerLoading = signal(false);
  readonly testerResult = signal<ResolveStepsResult | null>(null);
  testerForm = this.fb.nonNullable.group({
    codProduct: ['', Validators.required],
    codDistributionChannel: ['', Validators.required],
    codRiskProduct: [ANY_VALUE],
    codDistributionWay: [ANY_VALUE],
  });

  form = this.fb.nonNullable.group({
    codProductProcessFlow: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
    desProductProcessFlow: ['', Validators.required],
    codProcessFlow: ['', Validators.required],
    codProduct: ['', Validators.required],
    codDistributionChannel: ['', Validators.required],
    codRiskProduct: [ANY_VALUE],
    codDistributionWay: [ANY_VALUE],
  });

  constructor() {
    this.loadOptions();
    this.load();
  }

  private loadOptions(): void {
    this.catalogService.list(PROCESS_FLOWS_PATH).subscribe({ next: (rows) => this.processFlows.set(rows) });
    this.catalogService.list(PRODUCTS_PATH).subscribe({ next: (rows) => this.products.set(rows) });
    this.catalogService.list(DISTRIBUTION_CHANNELS_PATH).subscribe({ next: (rows) => this.channels.set(rows) });
    this.catalogService.list(DISTRIBUTION_WAYS_PATH).subscribe({ next: (rows) => this.ways.set(rows) });
    this.catalogService.list(RISK_PRODUCTS_PATH).subscribe({
      next: (rows) =>
        this.riskProducts.set(
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
          detail: this.transloco.translate('processFlows.assignments.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  riskProductLabel(row: CatalogRow): string {
    const riskProduct = row['SRiskProduct'] as Record<string, unknown> | undefined;
    return riskProduct
      ? String(riskProduct['CodRiskProduct'] ?? '')
      : this.transloco.translate('processFlows.assignments.anyValue');
  }

  distributionWayLabel(row: CatalogRow): string {
    const way = row['SDistributionWay'] as Record<string, unknown> | undefined;
    return way ? String(way['DesDistributionWay'] ?? '') : this.transloco.translate('processFlows.assignments.anyValue');
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.loadOptions();
    this.form = this.fb.nonNullable.group({
      codProductProcessFlow: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      desProductProcessFlow: ['', Validators.required],
      codProcessFlow: ['', Validators.required],
      codProduct: ['', Validators.required],
      codDistributionChannel: ['', Validators.required],
      codRiskProduct: [ANY_VALUE],
      codDistributionWay: [ANY_VALUE],
    });
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.loadOptions();
    const processFlow = row['SProcessFlow'] as Record<string, unknown> | undefined;
    const product = row['SProduct'] as Record<string, unknown> | undefined;
    const channel = row['SDistributionChannel'] as Record<string, unknown> | undefined;
    const riskProduct = row['SRiskProduct'] as Record<string, unknown> | undefined;
    const way = row['SDistributionWay'] as Record<string, unknown> | undefined;
    this.form = this.fb.nonNullable.group({
      codProductProcessFlow: [{ value: String(row['CodProductProcessFlow'] ?? ''), disabled: true }],
      desProductProcessFlow: [String(row['DesProductProcessFlow'] ?? ''), Validators.required],
      codProcessFlow: [String(processFlow?.['CodProcessFlow'] ?? ''), Validators.required],
      codProduct: [String(product?.['CodProduct'] ?? ''), Validators.required],
      codDistributionChannel: [String(channel?.['CodDistributionChannel'] ?? ''), Validators.required],
      codRiskProduct: [riskProduct ? String(riskProduct['CodRiskProduct'] ?? '') : ANY_VALUE],
      codDistributionWay: [way ? String(way['CodDistributionWay'] ?? '') : ANY_VALUE],
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
      codProductProcessFlow: raw.codProductProcessFlow,
      desProductProcessFlow: raw.desProductProcessFlow,
      codProcessFlow: raw.codProcessFlow,
      codProduct: raw.codProduct,
      codDistributionChannel: raw.codDistributionChannel,
      codRiskProduct: raw.codRiskProduct === ANY_VALUE ? undefined : raw.codRiskProduct,
      codDistributionWay: raw.codDistributionWay === ANY_VALUE ? undefined : raw.codDistributionWay,
    };

    if (this.dialogMode() === 'create') {
      this.catalogService.create(PATH, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.createdDetail', { item: raw.desProductProcessFlow }),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdeProductProcessFlow']);
      // Update sí soporta limpiar los comodines opcionales mandando ''.
      const updateBody = {
        ...body,
        codRiskProduct: raw.codRiskProduct === ANY_VALUE ? '' : raw.codRiskProduct,
        codDistributionWay: raw.codDistributionWay === ANY_VALUE ? '' : raw.codDistributionWay,
      };
      this.catalogService.update(PATH, id, updateBody).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.updatedDetail', { item: raw.desProductProcessFlow }),
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
    const desc = String(row['DesProductProcessFlow'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeProductProcessFlow']);
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

  openTester(): void {
    this.testerResult.set(null);
    this.loadOptions();
    this.testerForm.reset({ codProduct: '', codDistributionChannel: '', codRiskProduct: ANY_VALUE, codDistributionWay: ANY_VALUE });
    this.testerVisible.set(true);
  }

  closeTester(): void {
    this.testerVisible.set(false);
  }

  runTester(): void {
    if (this.testerForm.invalid) {
      this.testerForm.markAllAsTouched();
      return;
    }
    const raw = this.testerForm.getRawValue();
    let params = new HttpParams().set('codProduct', raw.codProduct).set('codDistributionChannel', raw.codDistributionChannel);
    if (raw.codRiskProduct !== ANY_VALUE) params = params.set('codRiskProduct', raw.codRiskProduct);
    if (raw.codDistributionWay !== ANY_VALUE) params = params.set('codDistributionWay', raw.codDistributionWay);

    this.testerLoading.set(true);
    this.http.get<ResolveStepsResult>(`${environment.apiUrl}${PATH}/resolve-steps`, { params }).subscribe({
      next: (result) => {
        this.testerResult.set(result);
        this.testerLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.testerLoading.set(false);
        this.showError(err);
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
