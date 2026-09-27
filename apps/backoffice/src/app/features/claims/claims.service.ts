import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Person } from '../../core/party/persons.service';

export type DecimalString = string;

export interface ClaimStateRef {
  CodState: string;
  DesState: string;
}

/** `GET /claims` (plural) -- fila liviana del listado, ver `ClaimsService.findAll` en el backend real.
 * `SState` acá es el de `TClaim` (siempre "sin transición", no se muestra en
 * pantalla -- ver el doc-comment de `ClaimDetailComponent`). El estado que sí
 * es real y se muestra es el de la carpeta (`TClaimFile[0].SState`, un solo
 * `TClaimFile` por siniestro en esta primera vuelta). */
export interface ClaimListItem {
  IdeClaim: string;
  NumClaim: string;
  TstOcurrence: string;
  TstNotification: string;
  IdeState: string;
  SState: ClaimStateRef;
  SClaimType: { CodClaimType: string; DesClaimType: string };
  TContractFile: { TContract: { NumContract: string } };
  TClaimFile: { SState: ClaimStateRef }[];
}

export interface ClaimCoverageProvision {
  IdeCoverageProvision: string;
  InvoicedAmount: DecimalString;
  CoveredAmount: DecimalString;
  ApprovedAmount: DecimalString;
  IndemnifiedAmount: DecimalString;
  NoCoveredAmount: DecimalString;
  SState: ClaimStateRef;
  TRiskCoverage: { SCoveragePlan: { IdeCoveragePlan: string; SCoverage: { DesCoverage: string } } };
}

/** `TGuaranteeProvision` -- uso registrado de una garantía (`SCoverageGuarantee`)
 * sobre una provisión de cobertura puntual (Fase 4, Etapa 2 cierre del
 * pendiente chico, 2026-09-27). Ver el doc-comment de
 * `GuaranteeProvisionsService` en el backend real: el backend ya existía
 * desde Etapa 2, esta es la primera UI que lo consume. */
export interface GuaranteeProvision {
  IdeGuaranteeProvision: string;
  InvoicedAmount: DecimalString;
  CoveredAmount: DecimalString;
  ApprovedAmount: DecimalString;
  IndemnifiedAmount: DecimalString;
  NoCoveredAmount: DecimalString;
  ManualDeductibleAmount: DecimalString | null;
  NumApplyUse: DecimalString | null;
  SState: ClaimStateRef;
  SCoverageGuarantee: { DesShort: string | null; SGuarantee: { DesGuarantee: string } };
}

export interface CreateGuaranteeProvisionRequest {
  ideCoverageGuarantee: string;
  invoicedAmount: number;
  coveredAmount: number;
  approvedAmount: number;
  indemnifiedAmount: number;
  noCoveredAmount: number;
  manualDeductibleAmount?: number;
  numApplyUse?: number;
}

/** `TApprovalDetail` -- decisión de aprobación POR COBERTURA (Fase 4, Etapa 2). Ver el doc-comment de `ApprovalsService` en el backend real. */
export interface ApprovalDetail {
  IdeApprovalDetail: string;
  ApprovedAmount: DecimalString;
  SState: ClaimStateRef;
  TCoverageProvision: { IdeCoverageProvision: string; TRiskCoverage: { SCoveragePlan: { SCoverage: { DesCoverage: string } } } };
}

export interface ClaimPayment {
  IdeClaimPayment: string;
  NumPayment: string;
  Amount: DecimalString;
  TstPayment: string;
  NumExternalPayment: string | null;
  DesObservation: string | null;
  SState: ClaimStateRef;
}

/** `TApproval` -- cabecera de aprobación (agrupa el pago de varias coberturas). */
export interface Approval {
  IdeApproval: string;
  NumApproval: string;
  DesObservation: string | null;
  SState: ClaimStateRef;
  SPaymentType: { CodPaymentType: string; DesPaymentType: string };
  TPerson: Person;
  TApprovalDetail: ApprovalDetail[];
  TClaimPayment: ClaimPayment[];
}

export interface CreateApprovalRequest {
  codPaymentType: string;
  idePersonPayment: string;
  desObservation?: string;
  details: { ideCoverageProvision: string; approvedAmount: number }[];
}

export type ApprovalDetailOperative = 'APROBAR' | 'RECHAZAR' | 'ESCALAR';
export type ClaimFileOperative = 'ENVIAR_A_REVISION' | 'ENVIAR_A_EVALUACION' | 'CERRAR' | 'REABRIR';

export interface CreatePaymentRequest {
  amount: number;
  tstPayment: string;
  numExternalPayment?: string;
  desObservation?: string;
}

export interface ClaimRequirement {
  IdeClaimRequirement: string;
  TstRequest: string;
  TstReception: string;
  DesLargeReview: string | null;
  SState: ClaimStateRef;
  SProductRequirement: {
    DesShort: string | null;
    DesLarge: string | null;
    IndMandatory: boolean;
    SRequirement: { CodRequirement: string; DesRequirement: string };
  };
}

export interface ClaimRisk {
  IdeClaimRisk: string;
  SState: ClaimStateRef;
  TFileRisk: {
    NumFileRisk: number;
    DesFileRisk: string | null;
    SRiskProduct: { DesShort: string | null; DesLarge: string | null };
    SPlanProductRisk: { SPlanProduct: { DesShort: string | null; DesPlanProduct: string } };
  };
  TCoverageProvision: ClaimCoverageProvision[];
  TClaimRequirement: ClaimRequirement[];
}

export interface ClaimFile {
  IdeClaimFile: string;
  NumClaimFile: string;
  DesLarge: string | null;
  SState: ClaimStateRef;
  SClaimEvent: { CodClaimEvent: string; DesClaimEvent: string };
  SCurrency: { CodCurrency: string; SymbolCurrency: string };
  TClaimRisk: ClaimRisk[];
  IdeCurrency?: string;
}

export interface ClaimDetail {
  IdeClaim: string;
  NumClaim: string;
  TstOcurrence: string;
  TstNotification: string;
  TstConstitution: string;
  SState: ClaimStateRef;
  SClaimType: { CodClaimType: string; DesClaimType: string };
  TContractFile: { NumContractFile: number; TContract: { NumContract: string; SProduct: { DesProduct: string } } };
  TClaimFile: ClaimFile[];
}

export interface DeclareClaimRequest {
  codClaimType: string;
  ideContractFile: string;
  codClaimEvent: string;
  codCurrency: string;
  tstOcurrence: string;
  tstNotification: string;
  tstConstitution: string;
  desLarge?: string;
  ideFileRisks: string[];
}

/** Cliente HTTP contra `claims-service` (`/claims/*`, vía el gateway) --
 * Fase 4 (Siniestros), Etapa 1, 2026-09-24. Ver el doc-comment de
 * `ClaimsService` en el backend real. */
@Injectable({ providedIn: 'root' })
export class ClaimsApiService {
  private readonly base = `${environment.apiUrl}/claims/claims`;
  private readonly claimFilesBase = `${environment.apiUrl}/claims/claim-files`;

  constructor(private readonly http: HttpClient) {}

  declare(dto: DeclareClaimRequest): Observable<ClaimDetail> {
    return this.http.post<ClaimDetail>(this.base, dto);
  }

  list(filterNumClaim?: string, codState?: string): Observable<ClaimListItem[]> {
    let params = new HttpParams();
    if (filterNumClaim) params = params.set('filterNumClaim', filterNumClaim);
    if (codState) params = params.set('codState', codState);
    return this.http.get<ClaimListItem[]>(this.base, { params });
  }

  findOne(ideClaim: string): Observable<ClaimDetail> {
    return this.http.get<ClaimDetail>(`${this.base}/${ideClaim}`);
  }

  markRequirementReceived(ideClaimFile: string, ideClaimRequirement: string): Observable<ClaimRequirement> {
    return this.http.patch<ClaimRequirement>(
      `${this.claimFilesBase}/${ideClaimFile}/requirements/${ideClaimRequirement}/received`,
      {},
    );
  }

  transitionClaimFileState(ideClaimFile: string, codOperative: ClaimFileOperative): Observable<ClaimFile> {
    return this.http.patch<ClaimFile>(`${this.claimFilesBase}/${ideClaimFile}/state`, { codOperative });
  }

  updateInvoicedAmount(ideCoverageProvision: string, invoicedAmount: number): Observable<ClaimCoverageProvision> {
    return this.http.patch<ClaimCoverageProvision>(
      `${environment.apiUrl}/claims/coverage-provisions/${ideCoverageProvision}/invoiced-amount`,
      { invoicedAmount },
    );
  }

  createApproval(ideClaimFile: string, dto: CreateApprovalRequest): Observable<Approval> {
    return this.http.post<Approval>(`${this.claimFilesBase}/${ideClaimFile}/approvals`, dto);
  }

  listApprovals(ideClaimFile: string): Observable<Approval[]> {
    return this.http.get<Approval[]>(`${this.claimFilesBase}/${ideClaimFile}/approvals`);
  }

  transitionApprovalDetail(ideApprovalDetail: string, codOperative: ApprovalDetailOperative): Observable<ApprovalDetail> {
    return this.http.patch<ApprovalDetail>(
      `${environment.apiUrl}/claims/approval-details/${ideApprovalDetail}/state`,
      { codOperative },
    );
  }

  createPayment(ideApproval: string, dto: CreatePaymentRequest): Observable<ClaimPayment> {
    return this.http.post<ClaimPayment>(`${environment.apiUrl}/claims/approvals/${ideApproval}/payments`, dto);
  }

  listGuaranteeProvisions(ideCoverageProvision: string): Observable<GuaranteeProvision[]> {
    return this.http.get<GuaranteeProvision[]>(
      `${environment.apiUrl}/claims/coverage-provisions/${ideCoverageProvision}/guarantee-provisions`,
    );
  }

  createGuaranteeProvision(
    ideCoverageProvision: string,
    dto: CreateGuaranteeProvisionRequest,
  ): Observable<GuaranteeProvision> {
    return this.http.post<GuaranteeProvision>(
      `${environment.apiUrl}/claims/coverage-provisions/${ideCoverageProvision}/guarantee-provisions`,
      dto,
    );
  }
}
