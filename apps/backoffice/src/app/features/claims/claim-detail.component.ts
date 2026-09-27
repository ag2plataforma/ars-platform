import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { Person, PersonsService } from '../../core/party/persons.service';
import {
  Approval,
  ApprovalDetail,
  ApprovalDetailOperative,
  ClaimCoverageProvision,
  ClaimDetail,
  ClaimFile,
  ClaimFileOperative,
  ClaimRequirement,
  ClaimRisk,
  ClaimsApiService,
} from './claims.service';

const PAYMENT_TYPES_PATH = '/reference-data/payment-types';

/** Fila auxiliar de la tabla de selección de coberturas del diálogo
 * "Nueva aprobación" -- puramente de UI, no se persiste tal cual (ver
 * `submitApproval`, arma `CreateApprovalRequest.details` a partir de las
 * filas marcadas `selected`). */
interface CoverageSelectionRow {
  provision: ClaimCoverageProvision;
  riskLabel: string;
  selected: boolean;
  approvedAmount: number;
}

/** Transiciones manuales disponibles de `TClaimFile` por estado actual
 * (`CodState`) -- ver `packages/database/scripts/seed-claims-approval-workflow.js`,
 * sección `TClaimFile`. `APROBAR`/`RECHAZAR`/`PAGAR` NO están acá porque
 * son automáticas (las dispara `ApprovalsService`/`ClaimPaymentsService`,
 * nunca un botón manual -- ver `TransitionClaimFileDto` en el backend real). */
const CLAIM_FILE_TRANSITIONS: Record<string, { op: ClaimFileOperative; labelKey: string }[]> = {
  DECLARADO: [{ op: 'ENVIAR_A_REVISION', labelKey: 'claims.detail.sendToReviewButton' }],
  EN_REVISION_REQUISITOS: [{ op: 'ENVIAR_A_EVALUACION', labelKey: 'claims.detail.sendToEvaluationButton' }],
  REABIERTO: [{ op: 'ENVIAR_A_EVALUACION', labelKey: 'claims.detail.sendToEvaluationButton' }],
  RECHAZADO: [{ op: 'CERRAR', labelKey: 'claims.detail.closeFileButton' }],
  PAGADO: [{ op: 'CERRAR', labelKey: 'claims.detail.closeFileButton' }],
  CERRADO: [{ op: 'REABRIR', labelKey: 'claims.detail.reopenButton' }],
};

/** `TApprovalDetail.SState.CodState` desde los que `ESCALAR` es una
 * transición legal (ver el mismo seed script) -- nivel 3 es el tope, no
 * hay a dónde escalar. */
const ESCALATABLE_STATES = new Set(['PENDIENTE_NIVEL_1', 'PENDIENTE_NIVEL_2']);
const PENDING_DETAIL_STATES = new Set(['PENDIENTE_NIVEL_1', 'PENDIENTE_NIVEL_2', 'PENDIENTE_NIVEL_3']);

/** Estados de `TClaimFile` en los que el monto "Reclamado" de una cobertura
 * todavía se puede editar -- espejo del mismo set en `ClaimsService.
 * updateInvoicedAmount` (backend real, quien lo hace cumplir de verdad;
 * esto es solo para no ofrecer el campo en pantalla cuando ya se sabe que
 * el backend lo va a rechazar). Pedido explícito del usuario (2026-09-27). */
const INVOICED_AMOUNT_EDITABLE_STATES = new Set(['DECLARADO', 'EN_REVISION_REQUISITOS', 'EN_EVALUACION']);

/**
 * Detalle de un siniestro puntual (`GET /claims/claims/:id`) -- Fase 4
 * (Siniestros). Etapa 1 (2026-09-24): declarar + ver, sin
 * aprobación/pago. Etapa 2 (2026-09-27) agregó acá el flujo de
 * aprobación completo: ciclo de vida de `TClaimFile` (botones de
 * transición manual), abrir una aprobación (`TApproval` +
 * `TApprovalDetail` por cobertura), decidir cada `TApprovalDetail`
 * (aprobar/rechazar/escalar -- el backend (`ApprovalsService.
 * transitionDetail`) es quien valida rol/rango contra
 * `SClaimApprovalThreshold`, esta pantalla solo muestra el error si
 * corresponde) y registrar el pago una vez la aprobación queda
 * "Cerrada" y la carpeta "Aprobado".
 *
 * "Recibido" de un requisito: ver el doc-comment de
 * `ClaimRequirementsService` en el backend real -- la convención de
 * Etapa 1 es `TstRequest === TstReception` = "pendiente" (`isReceived`
 * compara ambas fechas).
 *
 * Deliberadamente NO incluye acá el registro de uso de garantías
 * (`TGuaranteeProvision`, `GuaranteeProvisionsService` en el backend)
 * -- no hay todavía ningún endpoint de listado para `SCoverageGuarantee`
 * en el codebase (se buscó explícitamente), así que no hay forma de
 * armar un selector "elegir garantía" en pantalla. Queda pendiente para
 * una pasada futura; el backend ya funciona, falta solo esta UI.
 */
@Component({
  selector: 'app-claim-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    TagModule,
    ToastModule,
    DialogModule,
    SelectModule,
    InputTextModule,
    InputNumberModule,
    CheckboxModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './claim-detail.component.html',
})
export class ClaimDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly claimsApi = inject(ClaimsApiService);
  private readonly catalogService = inject(CatalogService);
  private readonly personsService = inject(PersonsService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly claim = signal<ClaimDetail | null>(null);
  readonly loading = signal(false);

  /** Aprobaciones por `IdeClaimFile` -- se cargan aparte de `GET
   *  /claims/claims/:id` (no vienen anidadas en el detalle del
   *  siniestro), ver `load()`. */
  readonly approvalsByFile = signal<Record<string, Approval[]>>({});
  readonly transitionBusy = signal(false);

  // --- Diálogo "Nueva aprobación" ---
  readonly approvalDialogVisible = signal(false);
  readonly approvalDialogFile = signal<ClaimFile | null>(null);
  readonly coverageSelections = signal<CoverageSelectionRow[]>([]);
  readonly paymentTypes = signal<CatalogRow[]>([]);
  readonly approvalSubmitting = signal(false);
  approvalForm = this.newApprovalForm();

  // --- Selector de persona a pagar (búsqueda por nombre, simplificado
  //     respecto de `BrokersTabComponent`: acá el titular del pago ya
  //     debería existir como persona asociada al contrato, no hace
  //     falta la opción de crear una nueva). ---
  readonly selectedPayeePerson = signal<Person | null>(null);
  readonly payeeSearchControl = this.fb.control('');
  readonly payeeSearching = signal(false);
  readonly payeeSearchResults = signal<Person[]>([]);
  readonly payeeSearchedEmpty = signal(false);

  // --- Diálogo "Registrar pago" ---
  readonly paymentDialogVisible = signal(false);
  readonly paymentDialogApproval = signal<Approval | null>(null);
  readonly paymentSubmitting = signal(false);
  paymentForm = this.newPaymentForm();

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) this.load(id);
    });
  }

  private newApprovalForm() {
    return this.fb.nonNullable.group({
      codPaymentType: ['', Validators.required],
      desObservation: [''],
    });
  }

  private newPaymentForm() {
    return this.fb.nonNullable.group({
      amount: [0, [Validators.required, Validators.min(0.01)]],
      tstPayment: ['', Validators.required],
      numExternalPayment: [''],
      desObservation: [''],
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.claimsApi.findOne(id).subscribe({
      next: (claim) => {
        this.claim.set(claim);
        this.loading.set(false);
        for (const file of claim.TClaimFile) {
          this.loadApprovals(file.IdeClaimFile);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.showError(err);
      },
    });
  }

  private loadApprovals(ideClaimFile: string): void {
    this.claimsApi.listApprovals(ideClaimFile).subscribe({
      next: (approvals) => this.approvalsByFile.update((byFile) => ({ ...byFile, [ideClaimFile]: approvals })),
    });
  }

  riskLabel(risk: ClaimRisk): string {
    const fileRisk = risk.TFileRisk;
    return fileRisk.DesFileRisk ?? fileRisk.SRiskProduct?.DesShort ?? `#${fileRisk.NumFileRisk}`;
  }

  planLabel(risk: ClaimRisk): string {
    const plan = risk.TFileRisk.SPlanProductRisk?.SPlanProduct;
    return String(plan?.DesShort ?? plan?.DesPlanProduct ?? '');
  }

  requirementLabel(requirement: ClaimRequirement): string {
    const productRequirement = requirement.SProductRequirement;
    return String(productRequirement.DesShort ?? productRequirement.SRequirement.DesRequirement ?? '');
  }

  isReceived(requirement: ClaimRequirement): boolean {
    return requirement.TstReception !== requirement.TstRequest;
  }

  // --- Edición de "Reclamado" (`TCoverageProvision.InvoicedAmount`) ---
  // Etapa 1 lo creaba fijo en 0, sin ninguna forma de cargarlo. Draft en un
  // campo plano (no signal) indexado por `IdeCoverageProvision`: alcanza con
  // la detección de cambios por default de este componente (no usa
  // OnPush), y evita reconstruir la estructura anidada de `claim()` solo
  // para reflejar lo que se está tipeando.
  private readonly invoicedDrafts: Record<string, number> = {};
  private readonly savingInvoiced = new Set<string>();

  invoicedAmountEditable(file: ClaimFile): boolean {
    return INVOICED_AMOUNT_EDITABLE_STATES.has(file.SState.CodState);
  }

  invoicedValue(provision: ClaimCoverageProvision): number {
    return this.invoicedDrafts[provision.IdeCoverageProvision] ?? Number(provision.InvoicedAmount);
  }

  onInvoicedInput(provision: ClaimCoverageProvision, value: number | null): void {
    this.invoicedDrafts[provision.IdeCoverageProvision] = value ?? 0;
  }

  isSavingInvoiced(provision: ClaimCoverageProvision): boolean {
    return this.savingInvoiced.has(provision.IdeCoverageProvision);
  }

  saveInvoicedAmount(provision: ClaimCoverageProvision): void {
    const amount = this.invoicedValue(provision);
    if (amount === Number(provision.InvoicedAmount)) return;
    this.savingInvoiced.add(provision.IdeCoverageProvision);
    this.claimsApi.updateInvoicedAmount(provision.IdeCoverageProvision, amount).subscribe({
      next: () => {
        this.savingInvoiced.delete(provision.IdeCoverageProvision);
        delete this.invoicedDrafts[provision.IdeCoverageProvision];
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('claims.detail.invoicedAmountUpdatedDetail'),
        });
        const id = this.claim()?.IdeClaim;
        if (id) this.load(id);
      },
      error: (err: HttpErrorResponse) => {
        this.savingInvoiced.delete(provision.IdeCoverageProvision);
        this.showError(err);
      },
    });
  }

  marcarRecibido(claimFileId: string, requirement: ClaimRequirement): void {
    this.claimsApi.markRequirementReceived(claimFileId, requirement.IdeClaimRequirement).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('claims.detail.requirementReceivedDetail'),
        });
        const id = this.claim()?.IdeClaim;
        if (id) this.load(id);
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  // --- Ciclo de vida de `TClaimFile` ---

  fileTransitions(file: ClaimFile): { op: ClaimFileOperative; labelKey: string }[] {
    return CLAIM_FILE_TRANSITIONS[file.SState.CodState] ?? [];
  }

  transitionFile(file: ClaimFile, op: ClaimFileOperative): void {
    this.transitionBusy.set(true);
    this.claimsApi.transitionClaimFileState(file.IdeClaimFile, op).subscribe({
      next: () => {
        this.transitionBusy.set(false);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('claims.detail.transitionSuccessDetail'),
        });
        const id = this.claim()?.IdeClaim;
        if (id) this.load(id);
      },
      error: (err: HttpErrorResponse) => {
        this.transitionBusy.set(false);
        this.showError(err);
      },
    });
  }

  // --- Diálogo "Nueva aprobación" ---

  canOpenApproval(file: ClaimFile): boolean {
    if (file.SState.CodState !== 'EN_EVALUACION') return false;
    const approvals = this.approvalsByFile()[file.IdeClaimFile] ?? [];
    return !approvals.some((approval) => approval.SState.CodState === 'PENDIENTE');
  }

  private approvedProvisionIds(file: ClaimFile): Set<string> {
    const approvals = this.approvalsByFile()[file.IdeClaimFile] ?? [];
    const ids = new Set<string>();
    for (const approval of approvals) {
      for (const detail of approval.TApprovalDetail) {
        ids.add(detail.TCoverageProvision.IdeCoverageProvision);
      }
    }
    return ids;
  }

  openApprovalDialog(file: ClaimFile): void {
    this.approvalDialogFile.set(file);
    this.approvalForm = this.newApprovalForm();
    this.resetPayeeSelection();
    const alreadyApproved = this.approvedProvisionIds(file);
    const rows: CoverageSelectionRow[] = [];
    for (const risk of file.TClaimRisk) {
      for (const provision of risk.TCoverageProvision) {
        if (alreadyApproved.has(provision.IdeCoverageProvision)) continue;
        rows.push({
          provision,
          riskLabel: this.riskLabel(risk),
          selected: false,
          approvedAmount: Number(provision.CoveredAmount),
        });
      }
    }
    this.coverageSelections.set(rows);
    if (this.paymentTypes().length === 0) {
      this.catalogService.list(PAYMENT_TYPES_PATH).subscribe({ next: (rows2) => this.paymentTypes.set(rows2) });
    }
    this.approvalDialogVisible.set(true);
  }

  closeApprovalDialog(): void {
    this.approvalDialogVisible.set(false);
  }

  toggleCoverageSelected(row: CoverageSelectionRow, checked: boolean): void {
    this.coverageSelections.update((rows) => rows.map((r) => (r === row ? { ...r, selected: checked } : r)));
  }

  updateCoverageAmount(row: CoverageSelectionRow, amount: number | null): void {
    this.coverageSelections.update((rows) => rows.map((r) => (r === row ? { ...r, approvedAmount: amount ?? 0 } : r)));
  }

  private resetPayeeSelection(): void {
    this.selectedPayeePerson.set(null);
    this.payeeSearchResults.set([]);
    this.payeeSearchedEmpty.set(false);
    this.payeeSearchControl.setValue('');
  }

  changePayee(): void {
    this.resetPayeeSelection();
  }

  searchPayeeByName(): void {
    const q = (this.payeeSearchControl.value ?? '').trim();
    if (q.length < 2) return;
    this.payeeSearching.set(true);
    this.payeeSearchedEmpty.set(false);
    this.payeeSearchResults.set([]);
    this.personsService.searchByName(q).subscribe({
      next: (people) => {
        this.payeeSearching.set(false);
        this.payeeSearchResults.set(people);
        this.payeeSearchedEmpty.set(people.length === 0);
      },
      error: (err: HttpErrorResponse) => {
        this.payeeSearching.set(false);
        this.showError(err);
      },
    });
  }

  pickPayee(person: Person): void {
    this.selectedPayeePerson.set(person);
    this.payeeSearchResults.set([]);
    this.payeeSearchedEmpty.set(false);
    this.payeeSearchControl.setValue('');
  }

  submitApproval(): void {
    if (this.approvalForm.invalid) {
      this.approvalForm.markAllAsTouched();
      return;
    }
    const file = this.approvalDialogFile();
    if (!file) return;
    const person = this.selectedPayeePerson();
    if (!person) {
      this.messages.add({
        severity: 'warn',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('claims.detail.missingPersonDetail'),
      });
      return;
    }
    const selected = this.coverageSelections().filter((row) => row.selected);
    if (selected.length === 0) {
      this.messages.add({
        severity: 'warn',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('claims.detail.missingCoveragesDetail'),
      });
      return;
    }
    const raw = this.approvalForm.getRawValue();
    this.approvalSubmitting.set(true);
    this.claimsApi
      .createApproval(file.IdeClaimFile, {
        codPaymentType: raw.codPaymentType,
        idePersonPayment: person.IdePerson,
        desObservation: raw.desObservation || undefined,
        details: selected.map((row) => ({
          ideCoverageProvision: row.provision.IdeCoverageProvision,
          approvedAmount: row.approvedAmount,
        })),
      })
      .subscribe({
        next: () => {
          this.approvalSubmitting.set(false);
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('claims.detail.approvalCreatedDetail'),
          });
          this.closeApprovalDialog();
          const id = this.claim()?.IdeClaim;
          if (id) this.load(id);
        },
        error: (err: HttpErrorResponse) => {
          this.approvalSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  // --- Decisiones de `TApprovalDetail` (aprobar/rechazar/escalar) ---

  isPendingDetail(detail: ApprovalDetail): boolean {
    return PENDING_DETAIL_STATES.has(detail.SState.CodState);
  }

  canEscalate(detail: ApprovalDetail): boolean {
    return ESCALATABLE_STATES.has(detail.SState.CodState);
  }

  transitionApprovalDetail(detail: ApprovalDetail, op: ApprovalDetailOperative): void {
    this.transitionBusy.set(true);
    this.claimsApi.transitionApprovalDetail(detail.IdeApprovalDetail, op).subscribe({
      next: () => {
        this.transitionBusy.set(false);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('claims.detail.transitionDetailSuccessDetail'),
        });
        const id = this.claim()?.IdeClaim;
        if (id) this.load(id);
      },
      error: (err: HttpErrorResponse) => {
        this.transitionBusy.set(false);
        this.showError(err);
      },
    });
  }

  // --- Diálogo "Registrar pago" ---

  canRegisterPayment(file: ClaimFile, approval: Approval): boolean {
    return file.SState.CodState === 'APROBADO' && approval.SState.CodState === 'CERRADA' && approval.TClaimPayment.length === 0;
  }

  approvedTotal(approval: Approval): number {
    return approval.TApprovalDetail.filter((d) => d.SState.CodState === 'APROBADO').reduce(
      (sum, d) => sum + Number(d.ApprovedAmount),
      0,
    );
  }

  openPaymentDialog(approval: Approval): void {
    this.paymentDialogApproval.set(approval);
    this.paymentForm = this.newPaymentForm();
    const today = new Date().toISOString().slice(0, 16);
    this.paymentForm.patchValue({ amount: this.approvedTotal(approval), tstPayment: today });
    this.paymentDialogVisible.set(true);
  }

  closePaymentDialog(): void {
    this.paymentDialogVisible.set(false);
  }

  submitPayment(): void {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    const approval = this.paymentDialogApproval();
    if (!approval) return;
    const raw = this.paymentForm.getRawValue();
    this.paymentSubmitting.set(true);
    this.claimsApi
      .createPayment(approval.IdeApproval, {
        amount: raw.amount,
        tstPayment: new Date(raw.tstPayment).toISOString(),
        numExternalPayment: raw.numExternalPayment || undefined,
        desObservation: raw.desObservation || undefined,
      })
      .subscribe({
        next: () => {
          this.paymentSubmitting.set(false);
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('claims.detail.paymentCreatedDetail'),
          });
          this.closePaymentDialog();
          const id = this.claim()?.IdeClaim;
          if (id) this.load(id);
        },
        error: (err: HttpErrorResponse) => {
          this.paymentSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  volver(): void {
    this.router.navigate(['/siniestros']);
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
