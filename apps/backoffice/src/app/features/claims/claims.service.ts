import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type DecimalString = string;

export interface ClaimStateRef {
  CodState: string;
  DesState: string;
}

/** `GET /claims` (plural) -- fila liviana del listado, ver `ClaimsService.findAll` en el backend real. */
export interface ClaimListItem {
  IdeClaim: string;
  NumClaim: string;
  TstOcurrence: string;
  TstNotification: string;
  IdeState: string;
  SState: ClaimStateRef;
  SClaimType: { CodClaimType: string; DesClaimType: string };
  TContractFile: { TContract: { NumContract: string } };
}

export interface ClaimCoverageProvision {
  IdeCoverageProvision: string;
  InvoicedAmount: DecimalString;
  CoveredAmount: DecimalString;
  ApprovedAmount: DecimalString;
  IndemnifiedAmount: DecimalString;
  NoCoveredAmount: DecimalString;
  SState: ClaimStateRef;
  TRiskCoverage: { SCoveragePlan: { SCoverage: { DesCoverage: string } } };
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
}
