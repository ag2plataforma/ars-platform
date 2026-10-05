import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { TableModule, TableRowSelectEvent } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RiskAttributeField, RiskAttributesService } from '../quotes/risk-attributes.service';
import { MOBILE_PHONE_CONTACT_CLASS, PersonDetail, PersonsService } from '../../core/party/persons.service';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import {
  ExtractionTarget,
  RequirementExtractionDialogComponent,
  StoredExtraction,
  storedExtractionOf,
} from '../requirements/requirement-extraction-dialog.component';
import {
  ActivateContractBody,
  ContractCoverage,
  ContractDetail,
  ContractFile,
  ContractOperation,
  ContractPerson,
  ContractReceipt,
  ContractRequirement,
  ContractRisk,
  ContractsService,
} from './contracts.service';
import { ContractDocumentsComponent } from '../documents/contract-documents.component';
import { downloadBlob } from '../../core/files/file.util';

const PRODUCT_ENDORSEMENTS_PATH = '/product-rating/product-endorsements';
const COVERAGE_PLANS_PATH = '/product-rating/coverage-plans';
const PLAN_PRODUCT_RISKS_PATH = '/product-rating/plan-product-risks';
const IDENTIFICATION_TYPES_PATH = '/reference-data/identification-types';

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

/** Fila de `GET /product-rating/plan-product-risks` (ver
 *  `PlanProductRisksService.findAll` en el backend real,
 *  `product-rating-service`) -- solo los campos que necesita el
 *  selector del diálogo "Agregar riesgo" (Etapa 4). Filtrado client-side
 *  por producto (el backend no expone ese filtro en el `GET` de lista),
 *  mismo criterio que ya usa `CoveragePlansTabComponent`/
 *  `CalculationRulesTabComponent` en Configuración de productos.
 *  `IdeRiskProduct` es un campo escalar directo de `SPlanProductRisk`
 *  (confirmado contra `PlanProductRisksService` real, no hace falta
 *  ningún include extra) -- se usa para pedir el schema de atributos
 *  personalizados del riesgo elegido, ver `loadAddRiskAttributeFields`. */
interface PlanProductRiskOption {
  IdePlanProductRisk: string;
  IdeRiskProduct: string;
  SPlanProduct: { DesShort: string | null; DesPlanProduct: string; SProduct: { CodProduct: string } };
  SRiskProduct: { DesShort: string | null; DesLarge: string | null };
  SState: { CodState: string };
}

/** Mapea un validador de `AttributeContent` a un `ValidatorFn` de
 *  Angular -- copia adaptada de `buildValidators` en
 *  `quotes.component.ts` (mismo comportamiento exacto: un
 *  `validationName` no reconocido se ignora, no bloquea el formulario).
 *  Duplicada acá en vez de compartida para no tocar `quotes.component.ts`
 *  (archivo ya commiteado, sin cambios pendientes) por un helper de 20
 *  líneas -- si en el futuro aparece un tercer lugar que la necesite,
 *  ahí sí vale la pena moverla a `risk-attributes.service.ts`. */
function buildAttributeValidators(validators: RiskAttributeField['validators']): ValidatorFn[] {
  const result: ValidatorFn[] = [];
  for (const v of validators ?? []) {
    const props = v.aditionalProps ?? {};
    switch (v.validationName) {
      case 'required':
        result.push(Validators.required);
        break;
      case 'min':
        if (typeof props['min'] === 'number') result.push(Validators.min(props['min']));
        break;
      case 'max':
        if (typeof props['max'] === 'number') result.push(Validators.max(props['max']));
        break;
      case 'maxLength':
        if (typeof props['maxLength'] === 'number') result.push(Validators.maxLength(props['maxLength']));
        break;
    }
  }
  return result;
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
    FormsModule,
    RequirementExtractionDialogComponent,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    RadioButtonModule,
    TextareaModule,
    SelectModule,
    TableModule,
    TabsModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
    ContractDocumentsComponent,
  ],
  providers: [MessageService],
  templateUrl: './contract-detail.component.html',
})
export class ContractDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly contracts = inject(ContractsService);
  private readonly riskAttributes = inject(RiskAttributesService);
  private readonly personsService = inject(PersonsService);
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

  /** Acción explícita "Activar contrato" -- sin diálogo (no requiere
   *  datos adicionales, a diferencia de Anular/los suplementos): un solo
   *  botón que llama directo a `ContractsService.activate()`. Solo
   *  habilitado mientras el contrato esté en "Borrador" (`BORRADOR`) -- una
   *  vez activo, esta acción ya no aplica. */
  readonly activateSubmitting = signal(false);
  readonly canActivate = computed(() => this.contract()?.SState.CodState === 'BORRADOR');

  /** Acción explícita "Renovar contrato" (backlog item 2, ver
   *  docs/02-roadmap.md) -- sin diálogo, mismo criterio que Activar: la
   *  renovación recalcula todo sola (fechas, prima, recibo), no hace
   *  falta pedirle nada al usuario para esta primera pasada manual (la
   *  pantalla de candidatos/aviso automático llega en una etapa
   *  posterior). Habilitado mientras el contrato esté Activo, tenga fecha
   *  de vencimiento definida, y esté dentro de los `MANUAL_RENEWAL_WINDOW_DAYS`
   *  días previos a esa fecha (o ya vencido) -- mismo criterio que valida
   *  el backend (`MANUAL_RENEWAL_WINDOW_DAYS` en `contracts.service.ts`
   *  del `underwriting-service`; si ese valor cambia hay que actualizar
   *  este también). Esto es solo para no mostrar el botón habilitado
   *  cuando obviamente va a fallar -- el backend es quien manda. */
  private readonly MANUAL_RENEWAL_WINDOW_DAYS = 30;
  readonly renewSubmitting = signal(false);
  readonly canRenew = computed(() => {
    const c = this.contract();
    if (!c || c.SState.CodState !== 'ACTIVO' || !c.TstEnd) return false;
    const msUntilExpiry = new Date(c.TstEnd).getTime() - Date.now();
    const daysUntilExpiry = msUntilExpiry / 86_400_000;
    return daysUntilExpiry <= this.MANUAL_RENEWAL_WINDOW_DAYS;
  });

  /** Cuotas del ciclo vigente: cada período de facturación junto al recibo
   *  (NEW/REN no anulado) que lo cubre. Mismo criterio que el backend
   *  (`findNextInstallment`): la cuota N es la N-ésima operación de recibos
   *  regulares del ciclo, ordenadas por fecha de inicio. */
  readonly installmentRows = computed(() => {
    const c = this.contract();
    if (!c) return [];
    const cycleStart = new Date(c.TstInitial).getTime();
    const cycleEnd = c.TstEnd ? new Date(c.TstEnd).getTime() : Number.POSITIVE_INFINITY;
    const periods = c.TContractBilling.filter(
      (p) => new Date(p.TstInitial).getTime() >= cycleStart && new Date(p.TstEnd).getTime() <= cycleEnd,
    );
    const byOperation = new Map<string, ContractReceipt[]>();
    [...c.TReceipt]
      .filter(
        (r) =>
          !r.TstCancellation &&
          ['NEW', 'REN'].includes(r.SReceiptType.CodReceiptType) &&
          new Date(r.TstInitial).getTime() >= cycleStart,
      )
      .sort((a, b) => new Date(a.TstInitial).getTime() - new Date(b.TstInitial).getTime())
      .forEach((r) => byOperation.set(r.IdeContractOperation, [...(byOperation.get(r.IdeContractOperation) ?? []), r]));
    const groups = [...byOperation.values()];
    return periods.map((period, index) => {
      const receipts = groups[index] ?? [];
      return {
        period,
        numReceipt: receipts.map((r) => r.NumReceipt).join(', '),
        prime: receipts.length ? receipts.reduce((sum, r) => sum + Number(r.Prime), 0) : null,
        issued: receipts.length > 0,
        paid: receipts.length > 0 && receipts.every((r) => r.SState.CodState === 'COBRADO'),
      };
    });
  });

  readonly issueSubmitting = signal(false);
  readonly canIssueNext = computed(() => {
    const c = this.contract();
    return !!c && c.SState.CodState === 'ACTIVO' && this.installmentRows().some((row) => !row.issued);
  });

  issueNextInstallment(): void {
    const c = this.contract();
    if (!c) return;
    this.issueSubmitting.set(true);
    this.contracts.issueNextInstallment(c.IdeContract).subscribe({
      next: (result) => {
        this.issueSubmitting.set(false);
        this.contract.set(result);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('contractDetail.installments.issuedDetail'),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.issueSubmitting.set(false);
        this.showError(err);
      },
    });
  }

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

  /** Diálogo "Agregar riesgo" (Etapa 4 de "Movimientos y suplementos del
   *  contrato", ver docs/02-roadmap.md) -- llama a
   *  `ContractsService.addRisk()`, que en el backend real crea un
   *  `TFileRisk` nuevo sobre el certificado seleccionado (`selectedFile`).
   *  Deliberadamente SIN selector de coberturas acá (decisión de negocio
   *  explícita del usuario, 2026-09-28: "mismo mecanismo" que alta de
   *  cobertura) -- el riesgo nace vacío y el usuario le agrega
   *  coberturas después con el botón "Agregar cobertura" (Etapa 3), una
   *  vez que lo selecciona en la pestaña Coberturas. El desplegable de
   *  Plan x Riesgo sale de `GET /product-rating/plan-product-risks`,
   *  filtrado client-side por el producto del contrato -- mismo criterio
   *  que ya usan las pestañas de Configuración de productos. */
  readonly addRiskDialogVisible = signal(false);
  readonly addRiskSubmitting = signal(false);
  readonly planProductRiskOptions = signal<PlanProductRiskOption[]>([]);
  readonly availablePlanProductRiskOptions = computed(() =>
    this.planProductRiskOptions().filter((row) => row.SState.CodState === 'ACTIVO'),
  );
  addRiskForm = this.buildAddRiskForm();

  private buildAddRiskForm() {
    return this.fb.nonNullable.group({
      idePlanProductRisk: ['', Validators.required],
      desFileRisk: [''],
      ideProductEndorsement: ['', Validators.required],
      tstSupplement: ['', Validators.required],
      desSupplement: ['', Validators.required],
    });
  }

  /** Atributos personalizados del riesgo elegido en "Agregar riesgo" --
   *  mismo mecanismo que `QuotesComponent.riskFieldsMap`/
   *  `buildRiskFieldsState` en la Etapa 1 de cotización, simplificado a
   *  una sola instancia (acá se agrega un riesgo a la vez, no una lista).
   *  Se recalcula en `loadAddRiskAttributeFields` cada vez que cambia
   *  `idePlanProductRisk` (ver la suscripción en `openAddRiskDialog`).
   *  Corrige el bug reportado por el usuario (2026-09-29): "no valida si
   *  para ese producto es necesario atributos personalizados (tal como
   *  aparecen en la cotización)" -- antes el riesgo se creaba siempre
   *  vacío, sin importar si el tipo de riesgo tenía atributos
   *  configurados. Simplificación deliberada frente a cotización: NO
   *  replica el gate `resolveActiveSteps`/`STEP_CODE_CUSTOM_ATTRIBUTES`
   *  (el contrato no expone `CodDistributionChannel`, solo su
   *  descripción ya resuelta) -- se muestra el form siempre que el
   *  schema tenga campos, mismo comportamiento "seguro por defecto" que
   *  ya usa cotización cuando todavía no hay canal elegido. */
  readonly addRiskAttributeFields = signal<RiskAttributeField[]>([]);
  readonly addRiskAttributesLoading = signal(false);
  addRiskAttributesForm = this.fb.group({});

  /** Diálogo "Dar de baja riesgo" (Etapa 4) -- llama a
   *  `ContractsService.removeRisk()`, que en el backend real cancela
   *  TODAS las coberturas activas del riesgo (devolución proporcional al
   *  tiempo, mismo mecanismo que "Baja de cobertura") y lo cierra. No
   *  pide monto ni cobertura -- solo endoso, fecha y motivo, mismo
   *  criterio que "Anular contrato"/"Baja de cobertura". */
  readonly removeRiskDialogVisible = signal(false);
  readonly removeRiskSubmitting = signal(false);
  readonly removeRiskRisk = signal<ContractRisk | null>(null);
  removeRiskForm = this.buildRemoveRiskForm();

  private buildRemoveRiskForm() {
    return this.fb.nonNullable.group({
      ideProductEndorsement: ['', Validators.required],
      tstSupplement: ['', Validators.required],
      desSupplement: ['', Validators.required],
    });
  }

  /** Diálogo "Cambiar datos" de Tomador/Titular (Etapa 5 de
   *  "Movimientos y suplementos del contrato") -- llama a
   *  `ContractsService.changePersonData()`, que en el backend real
   *  actualiza `TPerson`/`TAddress`/`TContactData` de la persona elegida
   *  Y registra la operación de trazabilidad en "Movimientos", aunque no
   *  toque ninguna prima (decisión explícita del usuario). Alcance de
   *  campos (`AskUserQuestion`, 2026-09-29): "Contacto + identidad
   *  básica" -- nombre, apellido, email, DNI, dirección y teléfono
   *  móvil. El form se precarga con los valores actuales de la persona
   *  (`PersonsService.findOne`, solo lectura contra `party-service`) al
   *  abrir el diálogo -- reemplaza el valor completo de cada campo, no
   *  un patch parcial. */
  readonly changePersonDialogVisible = signal(false);
  readonly changePersonSubmitting = signal(false);
  readonly changePersonLoading = signal(false);
  readonly changePersonTarget = signal<ContractPerson | null>(null);
  changePersonForm = this.buildChangePersonForm();

  private buildChangePersonForm() {
    return this.fb.nonNullable.group({
      desFirstName: ['', Validators.required],
      desLastName1: [''],
      desEmail: ['', [Validators.required, Validators.email]],
      numIdentification: [''],
      desAddressLine1: ['', Validators.required],
      desAddressLine2: [''],
      codPostal: ['', Validators.required],
      mobilePhone: ['', Validators.required],
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

  // --- Requisitos (Etapa 2: subida real de archivo -- ver doc-comment
  // de `RequirementsService` en underwriting-service) ---

  /** Sube (o reemplaza) el archivo de un requisito del contrato --
   *  mismo patrón que `QuotesComponent.onRequirementFileSelected`, pero
   *  acá `requirementRows` es un `computed` derivado de `contract()`
   *  (árbol anidado, no una lista plana independiente), así que tras
   *  subir se recarga el contrato completo en lugar de parchear una
   *  fila suelta. */
  onRequirementFileSelected(row: RequirementRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const ideContract = this.contract()?.IdeContract;
    if (!file || !ideContract) return;
    this.contracts.uploadRequirementFile(row.requirement.IdeContractRequirement, file).then(
      () => this.load(ideContract),
      () => {
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('requirements.wizardStep.updateErrorDetail'),
        });
      },
    );
  }

  // --- Extracción de datos del documento con IA (Fase 4) ---

  readonly extractionTarget = signal<ExtractionTarget | null>(null);

  hasExtraction(row: RequirementRow): boolean {
    return storedExtractionOf(row.requirement.Data) !== null;
  }

  openExtraction(row: RequirementRow, viewStored: boolean): void {
    const stored = viewStored ? storedExtractionOf(row.requirement.Data) : null;
    this.extractionTarget.set({
      kind: 'CONTRACT',
      id: row.requirement.IdeContractRequirement,
      name: row.requirement.SProductRequirement.DesShort ?? row.requirement.SProductRequirement.SRequirement.DesRequirement,
      stored,
    });
  }

  onExtractionSaved(extraction: StoredExtraction | null): void {
    const target = this.extractionTarget();
    this.extractionTarget.set(null);
    const current = this.contract();
    if (!target || !current) return;
    // Actualiza solo `Data.extraction` del requisito en memoria (sin recargar todo el contrato).
    for (const file of current.TContractFile) {
      for (const risk of file.TFileRisk) {
        for (const req of risk.TContractRequirement) {
          if (req.IdeContractRequirement !== target.id) continue;
          const data = { ...((req.Data as Record<string, unknown> | null) ?? {}) };
          if (extraction) data['extraction'] = extraction;
          else delete data['extraction'];
          req.Data = data;
        }
      }
    }
    this.contract.set({ ...current });
    this.messages.add({
      severity: 'success',
      summary: this.transloco.translate('common.done'),
      detail: this.transloco.translate('requirements.extraction.savedDetail'),
    });
  }

  downloadRequirementFile(row: RequirementRow): void {
    if (!row.requirement.DesFileName) return;
    const fileName = row.requirement.DesFileName;
    this.contracts.downloadRequirementFile(row.requirement.IdeContractRequirement).subscribe({
      next: (blob) => downloadBlob(blob, fileName),
      error: () => {
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('requirements.wizardStep.updateErrorDetail'),
        });
      },
    });
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

  /** Popup "Activar": elegir cómo se activa (ver `ActivateContractDto` en el
   *  backend): enviar el enlace de pago al tomador (la activación llega por
   *  el webhook de la pasarela) o activar sin pasarela con un motivo. */
  readonly activateDialogVisible = signal(false);
  readonly activateMode = signal<'PAYMENT_LINK' | 'MANUAL'>('PAYMENT_LINK');
  readonly activateReason = this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3)]);

  openActivateDialog(): void {
    this.activateReason.reset('');
    this.activateMode.set('PAYMENT_LINK');
    this.activateDialogVisible.set(true);
  }

  closeActivateDialog(): void {
    this.activateDialogVisible.set(false);
  }

  activateContract(): void {
    const c = this.contract();
    if (!c) return;
    const mode = this.activateMode();
    if (mode === 'MANUAL' && this.activateReason.invalid) {
      this.activateReason.markAsTouched();
      return;
    }
    const body: ActivateContractBody =
      mode === 'MANUAL'
        ? { mode: 'MANUAL', desReason: this.activateReason.value.trim() }
        : { mode: 'PAYMENT_LINK' };
    this.activateSubmitting.set(true);
    this.contracts.activate(c.IdeContract, body).subscribe({
      next: (result) => {
        this.activateSubmitting.set(false);
        this.activateDialogVisible.set(false);
        this.contract.set(result);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate(
            mode === 'MANUAL' ? 'contractDetail.activatedDetail' : 'contractDetail.paymentLink.sentDetail',
          ),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.activateSubmitting.set(false);
        this.showError(err);
      },
    });
  }

  /** Banner "Esperando pago": hay un enlace activo (ENVIADO/ABIERTO/CONSENTIDO) sin vencer. */
  readonly activePaymentLink = computed(() => {
    const link = this.contract()?.PaymentLink;
    return link && ['ENVIADO', 'ABIERTO', 'CONSENTIDO'].includes(link.CodStatus) ? link : null;
  });

  readonly paymentLinkSubmitting = signal(false);

  /** Mientras hay un enlace de pago activo se vuelve a leer el contrato cada
   *  pocos segundos (y al volver a esta pestaña): el cliente paga en otra
   *  ventana/dispositivo y el operador ve el cambio sin recargar. Se detiene
   *  solo cuando el enlace deja de estar activo o se sale de la pantalla. */
  private readonly watchPaymentLink = effect((onCleanup) => {
    if (!this.activePaymentLink()) return;
    const timer = setInterval(() => this.refreshSilently(), 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.refreshSilently();
    };
    document.addEventListener('visibilitychange', onVisible);
    onCleanup(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  });

  private refreshSilently(): void {
    const current = this.contract();
    if (!current || document.visibilityState === 'hidden') return;
    this.contracts.getContract(current.IdeContract).subscribe({
      next: (fresh) => {
        const now = this.contract();
        if (!now || now.IdeContract !== fresh.IdeContract) return;
        const stateChanged = fresh.SState.CodState !== now.SState.CodState;
        const linkChanged = fresh.PaymentLink?.CodStatus !== now.PaymentLink?.CodStatus;
        if (!stateChanged && !linkChanged) return;
        this.contract.set(fresh);
        if (stateChanged && fresh.SState.CodState !== 'BORRADOR') {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.paymentLink.paidDetail'),
          });
        }
      },
      error: () => {
        // Refresco en segundo plano: un fallo puntual no se muestra al operador.
      },
    });
  }

  resendPaymentLink(): void {
    const c = this.contract();
    if (!c) return;
    this.paymentLinkSubmitting.set(true);
    this.contracts.activate(c.IdeContract, { mode: 'PAYMENT_LINK' }).subscribe({
      next: (result) => {
        this.paymentLinkSubmitting.set(false);
        this.contract.set(result);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('contractDetail.paymentLink.sentDetail'),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.paymentLinkSubmitting.set(false);
        this.showError(err);
      },
    });
  }

  cancelPaymentLink(): void {
    const c = this.contract();
    if (!c) return;
    this.paymentLinkSubmitting.set(true);
    this.contracts.cancelPaymentLink(c.IdeContract).subscribe({
      next: (result) => {
        this.paymentLinkSubmitting.set(false);
        this.contract.set(result);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('contractDetail.paymentLink.cancelledDetail'),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.paymentLinkSubmitting.set(false);
        this.showError(err);
      },
    });
  }

  renewContract(): void {
    const c = this.contract();
    if (!c) return;
    this.renewSubmitting.set(true);
    this.contracts.renew(c.IdeContract).subscribe({
      next: (result) => {
        this.renewSubmitting.set(false);
        this.contract.set(result);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('contractDetail.renewedDetail'),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.renewSubmitting.set(false);
        this.showError(err);
      },
    });
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

  openAddRiskDialog(): void {
    const c = this.contract();
    const file = this.selectedFile();
    if (!c || !file) return;
    this.addRiskForm = this.buildAddRiskForm();
    this.resetAddRiskAttributeFields();
    this.addRiskForm.controls.idePlanProductRisk.valueChanges.subscribe((idePlanProductRisk) => {
      if (idePlanProductRisk) {
        this.loadAddRiskAttributeFields(idePlanProductRisk);
      } else {
        this.resetAddRiskAttributeFields();
      }
    });
    this.planProductRiskOptions.set([]);
    this.catalogService.list(PLAN_PRODUCT_RISKS_PATH).subscribe({
      next: (rows) => {
        const codProduct = c.SProduct.CodProduct;
        this.planProductRiskOptions.set(
          (rows as unknown as PlanProductRiskOption[]).filter((row) => row.SPlanProduct.SProduct.CodProduct === codProduct),
        );
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.productEndorsements.set([]);
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct: c.SProduct.CodProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.addRiskDialogVisible.set(true);
  }

  private resetAddRiskAttributeFields(): void {
    this.addRiskAttributesForm = this.fb.group({});
    this.addRiskAttributeFields.set([]);
    this.addRiskAttributesLoading.set(false);
  }

  /** Trae el schema de atributos personalizados del riesgo elegido
   *  (`RiskAttributesService.getSchema`) y arma el form dinámico -- un
   *  control por `IdeAttributeProperty`, con los validadores que declare
   *  cada campo. Mismo mecanismo que
   *  `QuotesComponent.loadRiskFields`/`buildRiskFieldsState`; ver el
   *  doc-comment de `addRiskAttributeFields` para la simplificación
   *  deliberada frente a cotización (sin gate de `resolveActiveSteps`). */
  private loadAddRiskAttributeFields(idePlanProductRisk: string): void {
    const option = this.planProductRiskOptions().find((row) => row.IdePlanProductRisk === idePlanProductRisk);
    this.resetAddRiskAttributeFields();
    if (!option) return;
    this.addRiskAttributesLoading.set(true);
    this.riskAttributes.getSchema(option.IdeRiskProduct).subscribe({
      next: (schema) => {
        for (const field of schema.fields) {
          const initialValue = field.type === 'checkbox' ? false : null;
          this.addRiskAttributesForm.addControl(
            field.ideAttributeProperty,
            this.fb.control(initialValue, buildAttributeValidators(field.validators)),
          );
        }
        this.addRiskAttributeFields.set(schema.fields);
        this.addRiskAttributesLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.addRiskAttributesLoading.set(false);
        this.showError(err);
      },
    });
  }

  addRiskFieldInvalid(field: RiskAttributeField): boolean {
    const control = this.addRiskAttributesForm.get(field.ideAttributeProperty);
    return !!control && control.invalid && control.touched;
  }

  addRiskFirstErrorMessage(field: RiskAttributeField): string {
    const control = this.addRiskAttributesForm.get(field.ideAttributeProperty);
    if (!control?.errors) return '';
    const key = Object.keys(control.errors)[0];
    return field.validationMessages[key] ?? this.transloco.translate<string>('quotes.invalidValueFallback');
  }

  closeAddRiskDialog(): void {
    this.addRiskDialogVisible.set(false);
  }

  planProductRiskLabel(row: PlanProductRiskOption): string {
    const plan = row.SPlanProduct.DesShort ?? row.SPlanProduct.DesPlanProduct;
    const risk = row.SRiskProduct.DesShort ?? row.SRiskProduct.DesLarge ?? '';
    return `${plan} / ${risk}`;
  }

  submitAddRisk(): void {
    const c = this.contract();
    const file = this.selectedFile();
    if (!c || !file) return;
    if (this.addRiskForm.invalid || this.addRiskAttributesForm.invalid || this.addRiskAttributesLoading()) {
      this.addRiskForm.markAllAsTouched();
      this.addRiskAttributesForm.markAllAsTouched();
      return;
    }
    const raw = this.addRiskForm.getRawValue();
    const hasAttributeFields = this.addRiskAttributeFields().length > 0;
    this.addRiskSubmitting.set(true);
    this.contracts
      .addRisk(c.IdeContract, {
        ideContractFile: file.IdeContractFile,
        idePlanProductRisk: raw.idePlanProductRisk,
        desFileRisk: raw.desFileRisk || undefined,
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
        riskAttributeValue: hasAttributeFields ? this.addRiskAttributesForm.getRawValue() : undefined,
      })
      .subscribe({
        next: (result) => {
          this.afterRiskSupplement(result);
          this.addRiskSubmitting.set(false);
          this.closeAddRiskDialog();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.addRiskDialog.appliedDetail'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.addRiskSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  openRemoveRiskDialog(risk: ContractRisk): void {
    const c = this.contract();
    if (!c) return;
    this.removeRiskRisk.set(risk);
    this.removeRiskForm = this.buildRemoveRiskForm();
    this.productEndorsements.set([]);
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct: c.SProduct.CodProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.removeRiskDialogVisible.set(true);
  }

  closeRemoveRiskDialog(): void {
    this.removeRiskDialogVisible.set(false);
    this.removeRiskRisk.set(null);
  }

  submitRemoveRisk(): void {
    const c = this.contract();
    const risk = this.removeRiskRisk();
    if (!c || !risk) return;
    if (this.removeRiskForm.invalid) {
      this.removeRiskForm.markAllAsTouched();
      return;
    }
    const raw = this.removeRiskForm.getRawValue();
    this.removeRiskSubmitting.set(true);
    this.contracts
      .removeRisk(c.IdeContract, {
        ideFileRisk: risk.IdeFileRisk,
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
      })
      .subscribe({
        next: (result) => {
          this.afterRiskSupplement(result);
          this.removeRiskSubmitting.set(false);
          this.closeRemoveRiskDialog();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.removeRiskDialog.appliedDetail'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.removeRiskSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  openChangePersonDialog(cp: ContractPerson): void {
    const c = this.contract();
    if (!c) return;
    this.changePersonTarget.set(cp);
    this.changePersonForm = this.buildChangePersonForm();
    this.changePersonLoading.set(true);
    this.changePersonDialogVisible.set(true);
    this.personsService.findOne(cp.IdePerson).subscribe({
      next: (person: PersonDetail) => {
        const mainAddress = person.TAddress.find((a) => a.IndMain) ?? person.TAddress[0] ?? null;
        const mobileContact =
          person.TContactData.find((cd) => cd.SContactClass.CodContactClass === MOBILE_PHONE_CONTACT_CLASS && cd.IndMain) ??
          person.TContactData.find((cd) => cd.SContactClass.CodContactClass === MOBILE_PHONE_CONTACT_CLASS) ??
          null;
        this.changePersonForm.patchValue({
          desFirstName: person.DesFirstName,
          desLastName1: person.DesLastName1 ?? '',
          desEmail: person.DesEmail,
          numIdentification: person.NumIdentification ?? '',
          desAddressLine1: mainAddress?.DesAddressLine1 ?? '',
          desAddressLine2: mainAddress?.DesAddressLine2 ?? '',
          codPostal: mainAddress?.CodPostal ?? '',
          mobilePhone: mobileContact?.DesContactData ?? '',
        });
        this.changePersonLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.changePersonLoading.set(false);
        this.showError(err);
      },
    });
    this.productEndorsements.set([]);
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct: c.SProduct.CodProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  closeChangePersonDialog(): void {
    this.changePersonDialogVisible.set(false);
    this.changePersonTarget.set(null);
  }

  submitChangePersonData(): void {
    const c = this.contract();
    const cp = this.changePersonTarget();
    if (!c || !cp) return;
    if (this.changePersonForm.invalid || this.changePersonLoading()) {
      this.changePersonForm.markAllAsTouched();
      return;
    }
    const raw = this.changePersonForm.getRawValue();
    this.changePersonSubmitting.set(true);
    this.contracts
      .changePersonData(c.IdeContract, {
        ideContractPerson: cp.IdeContractPerson,
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
        desFirstName: raw.desFirstName,
        desLastName1: raw.desLastName1 || undefined,
        desEmail: raw.desEmail,
        numIdentification: raw.numIdentification || undefined,
        desAddressLine1: raw.desAddressLine1,
        desAddressLine2: raw.desAddressLine2 || undefined,
        codPostal: raw.codPostal,
        mobilePhone: raw.mobilePhone,
      })
      .subscribe({
        next: (result) => {
          this.contract.set(result);
          this.changePersonSubmitting.set(false);
          this.closeChangePersonDialog();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.changePersonDialog.appliedDetail'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.changePersonSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  /** Refresca `selectedFile`/`selectedRisk` tras un suplemento de riesgo
   *  (alta o baja) para que las tablas de Riesgos/Coberturas muestren el
   *  estado nuevo sin que el usuario tenga que re-navegar -- mismo
   *  criterio que `afterCoverageSupplement` (Etapa 3), un nivel más
   *  arriba en la jerarquía. */
  private afterRiskSupplement(result: ContractDetail): void {
    this.contract.set(result);
    const refreshedFile = result.TContractFile.find((f) => f.IdeContractFile === this.selectedFile()?.IdeContractFile);
    this.selectedFile.set(refreshedFile ?? null);
    const risk = this.selectedRisk();
    if (risk) {
      const refreshedRisk = refreshedFile?.TFileRisk.find((r) => r.IdeFileRisk === risk.IdeFileRisk) ?? null;
      this.selectedRisk.set(refreshedRisk);
    }
  }

  // ---------------------------------------------------------------- Colectivos: certificados

  /** Diálogos "Alta de asegurado" / "Baja de asegurado" (colectivos, etapa 1). */
  readonly addCertDialogVisible = signal(false);
  readonly addCertSubmitting = signal(false);
  readonly identificationTypes = signal<CatalogRow[]>([]);
  addCertForm = this.buildAddCertForm();
  readonly removeCertDialogVisible = signal(false);
  readonly removeCertSubmitting = signal(false);
  readonly removeCertFile = signal<ContractFile | null>(null);
  removeCertForm = this.buildRemoveCertForm();

  private buildAddCertForm() {
    return this.fb.nonNullable.group({
      idePlanProductRisk: ['', Validators.required],
      desFirstName: ['', Validators.required],
      desLastName1: [''],
      desLastName2: [''],
      desEmail: ['', [Validators.required, Validators.email]],
      codIdentificationType: [''],
      numIdentification: [''],
      tstBirthdate: [''],
      ideProductEndorsement: ['', Validators.required],
      tstSupplement: ['', Validators.required],
      desSupplement: ['', Validators.required],
    });
  }

  private buildRemoveCertForm() {
    return this.fb.nonNullable.group({
      ideProductEndorsement: ['', Validators.required],
      tstSupplement: ['', Validators.required],
      desSupplement: ['', Validators.required],
    });
  }

  /** Nombre del asegurado de un certificado (rol ASEGURADO) para la tabla. */
  insuredOf(file: ContractFile): string {
    const person = file.TContractFilePerson?.find((p) => p.SPersonRol?.CodPersonRol === 'ASEGURADO')?.TPerson;
    return person ? [person.DesFirstName, person.DesLastName1].filter(Boolean).join(' ') : '';
  }

  insuredEmailOf(file: ContractFile): string {
    return file.TContractFilePerson?.find((p) => p.SPersonRol?.CodPersonRol === 'ASEGURADO')?.TPerson?.DesEmail ?? '';
  }

  openAddCertDialog(): void {
    const c = this.contract();
    if (!c) return;
    this.addCertForm = this.buildAddCertForm();
    this.resetAddRiskAttributeFields();
    this.addCertForm.controls.idePlanProductRisk.valueChanges.subscribe((idePlanProductRisk) => {
      if (idePlanProductRisk) {
        this.loadAddRiskAttributeFields(idePlanProductRisk);
      } else {
        this.resetAddRiskAttributeFields();
      }
    });
    this.planProductRiskOptions.set([]);
    this.catalogService.list(PLAN_PRODUCT_RISKS_PATH).subscribe({
      next: (rows) => {
        const codProduct = c.SProduct.CodProduct;
        this.planProductRiskOptions.set(
          (rows as unknown as PlanProductRiskOption[]).filter((row) => row.SPlanProduct.SProduct.CodProduct === codProduct),
        );
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.catalogService.list(IDENTIFICATION_TYPES_PATH).subscribe({
      next: (rows) => this.identificationTypes.set(rows),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.loadProductEndorsements(c);
    this.addCertDialogVisible.set(true);
  }

  private loadProductEndorsements(c: ContractDetail): void {
    this.productEndorsements.set([]);
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct: c.SProduct.CodProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  closeAddCertDialog(): void {
    this.addCertDialogVisible.set(false);
  }

  submitAddCert(): void {
    const c = this.contract();
    if (!c) return;
    if (this.addCertForm.invalid || this.addRiskAttributesForm.invalid || this.addRiskAttributesLoading()) {
      this.addCertForm.markAllAsTouched();
      this.addRiskAttributesForm.markAllAsTouched();
      return;
    }
    const raw = this.addCertForm.getRawValue();
    const hasAttributeFields = this.addRiskAttributeFields().length > 0;
    this.addCertSubmitting.set(true);
    this.contracts
      .addCertificate(c.IdeContract, {
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
        idePlanProductRisk: raw.idePlanProductRisk,
        insured: {
          desFirstName: raw.desFirstName,
          desLastName1: raw.desLastName1 || undefined,
          desLastName2: raw.desLastName2 || undefined,
          desEmail: raw.desEmail,
          codIdentificationType: raw.codIdentificationType || undefined,
          numIdentification: raw.numIdentification || undefined,
          tstBirthdate: raw.tstBirthdate || undefined,
          riskAttributeValue: hasAttributeFields
            ? (this.addRiskAttributesForm.getRawValue() as Record<string, unknown>)
            : undefined,
        },
      })
      .subscribe({
        next: (result) => {
          this.contract.set(result);
          this.addCertSubmitting.set(false);
          this.closeAddCertDialog();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.addCertDialog.appliedDetail'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.addCertSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  openRemoveCertDialog(file: ContractFile): void {
    const c = this.contract();
    if (!c) return;
    this.removeCertFile.set(file);
    this.removeCertForm = this.buildRemoveCertForm();
    this.loadProductEndorsements(c);
    this.removeCertDialogVisible.set(true);
  }

  closeRemoveCertDialog(): void {
    this.removeCertDialogVisible.set(false);
    this.removeCertFile.set(null);
  }

  submitRemoveCert(): void {
    const c = this.contract();
    const file = this.removeCertFile();
    if (!c || !file) return;
    if (this.removeCertForm.invalid) {
      this.removeCertForm.markAllAsTouched();
      return;
    }
    const raw = this.removeCertForm.getRawValue();
    this.removeCertSubmitting.set(true);
    this.contracts
      .removeCertificate(c.IdeContract, {
        ideContractFile: file.IdeContractFile,
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
      })
      .subscribe({
        next: (result) => {
          this.contract.set(result);
          if (this.selectedFile()?.IdeContractFile === file.IdeContractFile) {
            this.selectedFile.set(result.TContractFile.find((f) => f.IdeContractFile === file.IdeContractFile) ?? null);
            this.selectedRisk.set(null);
          }
          this.removeCertSubmitting.set(false);
          this.closeRemoveCertDialog();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('contractDetail.removeCertDialog.appliedDetail'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.removeCertSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  stateSeverity(codState: string): 'info' | 'warn' | 'success' | 'secondary' {
    switch (codState) {
      case 'ACTIVO':
        return 'success';
      case 'ANULADO':
      case 'MODIFICADO':
        return 'warn';
      case 'BORRADOR':
        return 'info';
      default:
        return 'secondary';
    }
  }

  volver(): void {
    this.router.navigate(['/contratos']);
  }
}
