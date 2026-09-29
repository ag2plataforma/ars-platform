import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { TableModule, TableRowSelectEvent } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RiskAttributesService } from '../quotes/risk-attributes.service';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import {
  ContractCoverage,
  ContractDetail,
  ContractFile,
  ContractOperation,
  ContractRequirement,
  ContractRisk,
  ContractsService,
} from './contracts.service';

const PRODUCT_ENDORSEMENTS_PATH = '/product-rating/product-endorsements';
const COVERAGE_PLANS_PATH = '/product-rating/coverage-plans';

/** Fila de `GET /product-rating/coverage-plans?idePlanProductRisk=...`
 *  (ver `CoveragePlansService.findAll`/`INCLUDE` en el backend real,
 *  `product-rating-service`) -- solo los campos que necesita el
 *  selector del diálogo "Agregar cobertura" (Etapa 3). */
interface CoveragePlanOption {
  IdeCoveragePlan: string;
  DesShort: string | null;
  IndFixedAmount: boolean;
  UpperAmount: string;
  SCoverage: { DesCoverage: string };
  SState: { CodState: string };
}

/** Un requisito ya "aplanado" con el riesgo al que pertenece, para la
 *  pestaña "Requisitos" (Nivel 1, sin selección previa -- ver el
 *  comentario de cabecera de la clase). */
interface RequirementRow {
  riskLabel: string;
  requirement: ContractRequirement;
}

/**
 * Detalle de un contrato puntual (`GET /contracts/:id`).
 *
 * Reestructurada el 23/09/2026 a pedido explícito del usuario ("mini
 * core de seguros... me gustaria mantener la estructura del antiguo
 * backoffice") como un árbol de pestañas de 3 niveles que se van
 * habilitando a medida que se selecciona una fila, calcado del diálogo
 * `pages/contract` del backoffice viejo (`[disabled]="disabledFileRisk"`/
 * `[disabled]="disabledRiskCoverage"`):
 *
 *   Nivel 1 (siempre habilitadas): Tomador/Titular, Certificados,
 *   Movimientos (con popup de Recibos por movimiento), Canales de
 *   distribución, Requisitos.
 *   Nivel 2 "Riesgos": deshabilitada hasta seleccionar un Certificado
 *   (`TContractFile`) en la pestaña Certificados.
 *   Nivel 3 "Coberturas": deshabilitada hasta seleccionar un Riesgo
 *   (`TFileRisk`) en la pestaña Riesgos.
 *
 * Diferencia deliberada frente al sistema viejo, tal como lo pidió el
 * usuario: "Movimientos" y "Requisitos" son Nivel 1 acá (siempre
 * habilitadas), no dependen de seleccionar un archivo/riesgo primero.
 *
 * La info general del contrato (número, producto, vigencia, forma de
 * pago, estado) ya no es una pestaña propia -- el usuario no la incluyó
 * en su lista de pestañas -- se muestra como una franja compacta arriba
 * de las pestañas.
 *
 * Selección de fila = navegación: al seleccionar un Certificado se
 * habilita Y se pasa automáticamente a la pestaña Riesgos (mismo
 * criterio para Riesgo -> Coberturas); es una decisión de UX no
 * explícitamente pedida (el usuario dijo "activar", no "navegar"), pero
 * ahorra un clic y es el patrón esperado en un drill-down -- fácil de
 * revertir si no gusta en pantalla.
 *
 * Preparada para lo que sigue en el roadmap (modificaciones/suplementos
 * de póliza): la pestaña "Movimientos" ya lista `TContractOperation` en
 * orden (`NumOperation` asc) con su tipo real -- el día que se
 * implementen endosos, cada uno aparece ahí como una operación más, sin
 * cambiar la estructura de esta pantalla.
 */
@Component({
  selector: 'app-contract-detail',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    TableModule,
    TabsModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './contract-detail.component.html',
})
export class ContractDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly contracts = inject(ContractsService);
  private readonly riskAttributes = inject(RiskAttributesService);
  private readonly catalogService = inject(CatalogService);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly contract = signal<ContractDetail | null>(null);
  readonly loading = signal(false);
  readonly activeTab = signal<string | number>('personas');

  /** Certificado (`TContractFile`) seleccionado en la pestaña
   *  Certificados -- habilita y alimenta la pestaña "Riesgos". */
  readonly selectedFile = signal<ContractFile | null>(null);
  /** Riesgo (`TFileRisk`) seleccionado en la pestaña Riesgos -- habilita
   *  y alimenta la pestaña "Coberturas". */
  readonly selectedRisk = signal<ContractRisk | null>(null);

  readonly risksDisabled = computed(() => this.selectedFile() === null);
  readonly coveragesDisabled = computed(() => this.selectedRisk() === null);
  readonly selectedFileRisks = computed(() => this.selectedFile()?.TFileRisk ?? []);
  readonly selectedRiskCoverages = computed(() => this.selectedRisk()?.TRiskCoverage ?? []);

  /** Requisitos de todos los riesgos, aplanados con el nombre del
   *  riesgo -- "Requisitos" es Nivel 1 (no depende de seleccionar un
   *  certificado/riesgo primero), así que se muestran todos juntos. */
  readonly requirementRows = computed<RequirementRow[]>(() => {
    const files = this.contract()?.TContractFile ?? [];
    const rows: RequirementRow[] = [];
    for (const file of files) {
      for (const risk of file.TFileRisk) {
        const riskLabel = risk.DesFileRisk ?? risk.SRiskProduct.DesShort ?? '';
        for (const requirement of risk.TContractRequirement) {
          rows.push({ riskLabel, requirement });
        }
      }
    }
    return rows;
  });

  /** Movimiento (`TContractOperation`) seleccionado -- alimenta el popup
   *  de Recibos. */
  readonly selectedOperation = signal<ContractOperation | null>(null);
  readonly receiptsDialogVisible = signal(false);
  readonly selectedOperationReceipts = computed(() => {
    const op = this.selectedOperation();
    if (!op) return [];
    return this.contract()?.TReceipt.filter((r) => r.IdeContractOperation === op.IdeContractOperation) ?? [];
  });

  /** Popup "atributos personalizados" de un riesgo -- resuelve
   *  `TFileRisk.RiskAttributeValue` (`{ IdeAttributeProperty: valor }`)
   *  contra el schema real (`RiskAttributesService.getSchema`, el mismo
   *  que arma el formulario dinámico en la Etapa 1 de Cotización) para
   *  mostrar etiquetas y opciones legibles en vez del JSON crudo. */
  readonly attributesDialogVisible = signal(false);
  readonly attributesDialogLoading = signal(false);
  readonly attributesDialogFields = signal<Array<{ label: string; value: string }>>([]);

  /** Diálogo "Anular contrato" (Etapa 1 de "Movimientos y suplementos del
   *  contrato", ver docs/02-roadmap.md) -- llama a
   *  `ContractsService.cancel()`, que en el backend real ya hace toda la
   *  cascada de anulación (`ContractsService.cancel()` en
   *  underwriting-service). Solo se puede anular un contrato "ACTIVO";
   *  el propio backend valida el resto (estado, endoso, etc.). */
  readonly cancelDialogVisible = signal(false);
  readonly cancelSubmitting = signal(false);
  readonly productEndorsements = signal<CatalogRow[]>([]);
  readonly canCancel = computed(() => this.contract()?.SState.CodState === 'ACTIVO');
  cancelForm = this.buildCancelForm();

  private buildCancelForm() {
    return this.fb.nonNullable.group({
      ideProductEndorsement: ['', Validators.required],
      tstCancellation: ['', Validators.required],
      desCancellation: ['', Validators.required],
    });
  }

  /** Diálogo "Nuevo suplemento" (Etapa 2 de "Movimientos y suplementos
   *  del contrato", ver docs/02-roadmap.md) -- llama a
   *  `ContractsService.changeInsuredAmount()`, que en el backend real
   *  hace la cascada de "Cambio de monto asegurado" sobre UNA
   *  `TRiskCoverage` puntual (no todo el contrato): movimiento nuevo +
   *  prima recalculada proporcional al monto. Se abre desde un botón por
   *  fila en la pestaña "Coberturas" (`openChangeAmountDialog`), así que
   *  la cobertura ya viene resuelta -- no hace falta seleccionarla en el
   *  formulario. Reutiliza la misma lista de `productEndorsements` que
   *  el diálogo de anulación (ambos filtran por `SState.CodState ===
   *  'ACTIVO'`; el usuario elige el endoso correcto en el desplegable). */
  readonly changeAmountDialogVisible = signal(false);
  readonly changeAmountSubmitting = signal(false);
  readonly changeAmountCoverage = signal<ContractCoverage | null>(null);
  changeAmountForm = this.buildChangeAmountForm();

  private buildChangeAmountForm() {
    return this.fb.nonNullable.group({
      ideProductEndorsement: ['', Validators.required],
      newAmount: [0, [Validators.required, Validators.min(0.01)]],
      tstSupplement: ['', Validators.required],
      desSupplement: ['', Validators.required],
    });
  }

  /** Diálogo "Agregar cobertura" (Etapa 3 de "Movimientos y suplementos
   *  del contrato", ver docs/02-roadmap.md) -- llama a
   *  `ContractsService.addCoverage()`, que en el backend real crea una
   *  `TRiskCoverage` nueva sobre el riesgo seleccionado (`selectedRisk`).
   *  El desplegable de coberturas sale de
   *  `GET /product-rating/coverage-plans?idePlanProductRisk=...` (mismo
   *  endpoint que usa la pestaña "Coberturas" de Configuración de
   *  productos), filtrado acá en el front para excluir las que el
   *  riesgo ya tiene activas -- para cambiarles el monto existe
   *  `changeInsuredAmount`, no tiene sentido duplicar. El monto es
   *  opcional (decisión explícita del usuario, 2026-09-28): si se deja
   *  vacío, el backend real usa el default de `SCoveragePlan`. */
  readonly addCoverageDialogVisible = signal(false);
  readonly addCoverageSubmitting = signal(false);
  readonly coveragePlanOptions = signal<CoveragePlanOption[]>([]);
  readonly availableCoveragePlanOptions = computed(() => {
    const activeIds = new Set(
      this.selectedRiskCoverages()
        .filter((cov) => cov.SState.CodState === 'ACTIVO')
        .map((cov) => cov.SCoveragePlan.IdeCoveragePlan),
    );
    return this.coveragePlanOptions().filter((plan) => plan.SState.CodState === 'ACTIVO' && !activeIds.has(plan.IdeCoveragePlan));
  });
  addCoverageForm = this.buildAddCoverageForm();

  private buildAddCoverageForm() {
    return this.fb.nonNullable.group({
      ideCoveragePlan: ['', Validators.required],
      newAmount: this.fb.control<number | null>(null),
      ideProductEndorsement: ['', Validators.required],
      tstSupplement: ['', Validators.required],
      desSupplement: ['', Validators.required],
    });
  }

  /** Diálogo "Dar de baja cobertura" (Etapa 3) -- llama a
   *  `ContractsService.removeCoverage()`, que en el backend real es
   *  literalmente el mecanismo de `changeInsuredAmount` con
   *  `newAmount=0` más el cierre de la `TRiskCoverage` (ver el
   *  doc-comment de `ContractsService.removeCoverage` en el backend
   *  real). No pide monto -- solo endoso, fecha y motivo, mismo criterio
   *  que "Anular contrato". */
  readonly removeCoverageDialogVisible = signal(false);
  readonly removeCoverageSubmitting = signal(false);
  readonly removeCoverageCoverage = signal<ContractCoverage | null>(null);
  removeCoverageForm = this.buildRemoveCoverageForm();

  private buildRemoveCoverageForm() {
    return this.fb.nonNullable.group({
      ideProductEndorsement: ['', Validators.required],
      tstSupplement: ['', Validators.required],
      desSupplement: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.load(id);
      }
    });
  }

  private load(ideContract: string): void {
    this.loading.set(true);
    this.contracts.getContract(ideContract).subscribe({
      next: (result) => {
        this.contract.set(result);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
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

  onFileSelect(event: TableRowSelectEvent): void {
    const file = event.data as ContractFile;
    this.selectedFile.set(file);
    this.selectedRisk.set(null);
    this.activeTab.set('riesgos');
  }

  onRiskSelect(event: TableRowSelectEvent): void {
    const risk = event.data as ContractRisk;
    this.selectedRisk.set(risk);
    this.activeTab.set('coberturas');
  }

  onOperationSelect(event: TableRowSelectEvent): void {
    this.selectedOperation.set(event.data as ContractOperation);
    this.receiptsDialogVisible.set(true);
  }

  closeReceiptsDialog(): void {
    this.receiptsDialogVisible.set(false);
  }

  openAttributesDialog(risk: ContractRisk): void {
    this.attributesDialogVisible.set(true);
    this.attributesDialogLoading.set(true);
    this.attributesDialogFields.set([]);
    this.riskAttributes.getSchema(risk.SRiskProduct.IdeRiskProduct).subscribe({
      next: (schema) => {
        const raw = risk.RiskAttributeValue ?? {};
        const fields = schema.fields.map((field) => {
          const rawValue = (raw as Record<string, unknown>)[field.ideAttributeProperty];
          const option = field.options?.find((o) => String(o.value) === String(rawValue));
          const value = option ? option.key : rawValue !== undefined && rawValue !== null ? String(rawValue) : this.transloco.translate<string>('common.dash');
          return { label: field.label, value };
        });
        this.attributesDialogFields.set(fields);
        this.attributesDialogLoading.set(false);
      },
      error: () => {
        this.attributesDialogLoading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate<string>('common.unexpectedError'),
        });
      },
    });
  }

  closeAttributesDialog(): void {
    this.attributesDialogVisible.set(false);
  }

  openCancelDialog(): void {
    const c = this.contract();
    if (!c) return;
    this.cancelForm = this.buildCancelForm();
    this.productEndorsements.set([]);
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct: c.SProduct.CodProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.cancelDialogVisible.set(true);
  }

  closeCancelDialog(): void {
    this.cancelDialogVisible.set(false);
  }

  submitCancel(): void {
    const c = this.contract();
    if (!c) return;
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      return;
    }
    const raw = this.cancelForm.getRawValue();
    this.cancelSubmitting.set(true);
    this.contracts
      .cancel(c.IdeContract, {
        ideProductEndorsement: raw.ideProductEndorsement,
        tstCancellation: raw.tstCancellation,
        desCancellation: raw.desCancellation,
      })
      .subscribe({
        next: (result) => {
          this.cancelSubmitting.set(false);
          this.contract.set(result);
          this.closeCancelDialog();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.cancelDialog.cancelledDetail'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.cancelSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  openChangeAmountDialog(coverage: ContractCoverage): void {
    const c = this.contract();
    if (!c) return;
    this.changeAmountCoverage.set(coverage);
    this.changeAmountForm = this.buildChangeAmountForm();
    this.changeAmountForm.patchValue({ newAmount: Number(coverage.Amount) });
    this.productEndorsements.set([]);
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct: c.SProduct.CodProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.changeAmountDialogVisible.set(true);
  }

  closeChangeAmountDialog(): void {
    this.changeAmountDialogVisible.set(false);
    this.changeAmountCoverage.set(null);
  }

  submitChangeAmount(): void {
    const c = this.contract();
    const coverage = this.changeAmountCoverage();
    if (!c || !coverage) return;
    if (this.changeAmountForm.invalid) {
      this.changeAmountForm.markAllAsTouched();
      return;
    }
    const raw = this.changeAmountForm.getRawValue();
    this.changeAmountSubmitting.set(true);
    this.contracts
      .changeInsuredAmount(c.IdeContract, {
        ideRiskCoverage: coverage.IdeRiskCoverage,
        newAmount: raw.newAmount,
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
      })
      .subscribe({
        next: (result) => {
          this.changeAmountSubmitting.set(false);
          this.contract.set(result);
          // La cobertura viene de un objeto congelado en el momento en que
          // se abrió el diálogo -- tras recargar el contrato, refrescar
          // `selectedRisk` para que la tabla de Coberturas (que lee
          // `selectedRiskCoverages()`, derivado de `selectedRisk()`) muestre
          // el monto/prima nuevos sin que el usuario tenga que re-seleccionar
          // el riesgo a mano.
          const risk = this.selectedRisk();
          if (risk) {
            const refreshedFile = result.TContractFile.find((f) => f.IdeContractFile === this.selectedFile()?.IdeContractFile);
            const refreshedRisk = refreshedFile?.TFileRisk.find((r) => r.IdeFileRisk === risk.IdeFileRisk) ?? null;
            this.selectedFile.set(refreshedFile ?? null);
            this.selectedRisk.set(refreshedRisk);
          }
          this.closeChangeAmountDialog();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.changeAmountDialog.appliedDetail'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.changeAmountSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  openAddCoverageDialog(): void {
    const c = this.contract();
    const risk = this.selectedRisk();
    if (!c || !risk) return;
    this.addCoverageForm = this.buildAddCoverageForm();
    this.coveragePlanOptions.set([]);
    this.catalogService.list(COVERAGE_PLANS_PATH, { idePlanProductRisk: risk.IdePlanProductRisk }).subscribe({
      next: (rows) => this.coveragePlanOptions.set(rows as unknown as CoveragePlanOption[]),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.productEndorsements.set([]);
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct: c.SProduct.CodProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.addCoverageDialogVisible.set(true);
  }

  closeAddCoverageDialog(): void {
    this.addCoverageDialogVisible.set(false);
  }

  submitAddCoverage(): void {
    const c = this.contract();
    const risk = this.selectedRisk();
    if (!c || !risk) return;
    if (this.addCoverageForm.invalid) {
      this.addCoverageForm.markAllAsTouched();
      return;
    }
    const raw = this.addCoverageForm.getRawValue();
    this.addCoverageSubmitting.set(true);
    this.contracts
      .addCoverage(c.IdeContract, {
        ideFileRisk: risk.IdeFileRisk,
        ideCoveragePlan: raw.ideCoveragePlan,
        newAmount: raw.newAmount ?? undefined,
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
      })
      .subscribe({
        next: (result) => {
          this.afterCoverageSupplement(result, risk);
          this.addCoverageSubmitting.set(false);
          this.closeAddCoverageDialog();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.addCoverageDialog.appliedDetail'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.addCoverageSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  openRemoveCoverageDialog(coverage: ContractCoverage): void {
    const c = this.contract();
    if (!c) return;
    this.removeCoverageCoverage.set(coverage);
    this.removeCoverageForm = this.buildRemoveCoverageForm();
    this.productEndorsements.set([]);
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct: c.SProduct.CodProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.removeCoverageDialogVisible.set(true);
  }

  closeRemoveCoverageDialog(): void {
    this.removeCoverageDialogVisible.set(false);
    this.removeCoverageCoverage.set(null);
  }

  submitRemoveCoverage(): void {
    const c = this.contract();
    const coverage = this.removeCoverageCoverage();
    const risk = this.selectedRisk();
    if (!c || !coverage || !risk) return;
    if (this.removeCoverageForm.invalid) {
      this.removeCoverageForm.markAllAsTouched();
      return;
    }
    const raw = this.removeCoverageForm.getRawValue();
    this.removeCoverageSubmitting.set(true);
    this.contracts
      .removeCoverage(c.IdeContract, {
        ideRiskCoverage: coverage.IdeRiskCoverage,
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
      })
      .subscribe({
        next: (result) => {
          this.afterCoverageSupplement(result, risk);
          this.removeCoverageSubmitting.set(false);
          this.closeRemoveCoverageDialog();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.removeCoverageDialog.appliedDetail'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.removeCoverageSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  /** Refresca `selectedFile`/`selectedRisk` tras un suplemento de
   *  cobertura (alta o baja) para que la tabla de Coberturas muestre el
   *  estado nuevo sin que el usuario tenga que re-seleccionar el riesgo
   *  a mano -- mismo criterio que usaba `submitChangeAmount` (Etapa 2),
   *  extraído acá a un helper porque ahora lo comparten 3 flujos. */
  private afterCoverageSupplement(result: ContractDetail, risk: ContractRisk): void {
    this.contract.set(result);
    const refreshedFile = result.TContractFile.find((f) => f.IdeContractFile === this.selectedFile()?.IdeContractFile);
    const refreshedRisk = refreshedFile?.TFileRisk.find((r) => r.IdeFileRisk === risk.IdeFileRisk) ?? null;
    this.selectedFile.set(refreshedFile ?? null);
    this.selectedRisk.set(refreshedRisk);
  }

  stateSeverity(codState: string): 'info' | 'warn' | 'success' | 'secondary' {
    switch (codState) {
      case 'ACTIVO':
        return 'success';
      case 'SEED_ANULADO':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  volver(): void {
    this.router.navigate(['/contratos']);
  }
}
