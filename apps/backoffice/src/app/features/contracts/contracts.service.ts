import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Una fila de `GET /contracts` (plural) -- deliberadamente liviana
 *  (sin riesgos/coberturas/facturación, que solo hacen falta al abrir
 *  UN contrato puntual), mismo criterio que `QuoteListItem`. Ver
 *  `ContractsService.findAll` en el backend real. */
export interface ContractListItem {
  ideContract: string;
  numContract: string;
  desProduct: string;
  /** `TContractDistributionChannel` con `IndMain=true` -- `null` si por
   *  algún motivo el contrato no tiene canal principal cargado. */
  desInitialChannel: string | null;
  tstInitial: string;
  tstEnd: string | null;
  tstSubscription: string;
  desValidityType: string;
  contractAge: number;
  desPaymentFraction: string;
  codState: string;
  desState: string;
}

export interface ContractListResponse {
  items: ContractListItem[];
  total: number;
  page: number;
  limit: number;
}

/** Filtros de `GET /contracts` -- mismo shape que `ListContractsDto` en
 *  el backend real. Todo opcional. */
export interface ListContractsParams {
  codProduct?: string;
  codState?: string;
  dateFrom?: string;
  dateTo?: string;
  all?: boolean;
  page?: number;
  limit?: number;
  /** Ver `ListContractsDto.sortField`/`.sortOrder` en el backend real --
   *  misma lista cerrada de columnas ordenables. */
  sortField?: string;
  sortOrder?: number;
  filterNumContract?: string;
}

/** `GET /contracts/:id` -- objeto Prisma crudo (PascalCase, igual
 * criterio que `QuotePerson`), tal como lo arma `ContractsService.findOne`
 * en el backend real. Cubre las 11 tablas relacionadas al contrato que
 * pidió el usuario (ver docs/02-roadmap.md, pantalla de detalle de
 * contrato "mucho más completa"): personas, archivo(s)/riesgos/
 * coberturas, facturación, recibos, canal de distribución, movimientos/
 * operaciones (con sus documentos) y requisitos. Diseño calcado del
 * backoffice viejo (`ag2backofficewebapp`, `pages/contract`), que
 * organizaba exactamente estas mismas tablas en pestañas -- ver
 * `ContractDetailComponent`. */

/** `Decimal` de Prisma -- serializa como string en el JSON real
 *  (confirmado: `toJSON` de `decimal.js` en el runtime de Prisma), no
 *  como number. El pipe `number` de Angular acepta `string | number`
 *  tal cual, así que se tipa así en vez de convertir en el backend (a
 *  diferencia de `buildPricingResult`/`getSummary`, que sí convierten
 *  porque arman una respuesta propia, no un pass-through de Prisma). */
export type DecimalString = string;

export interface ContractStateRef {
  CodState: string;
  DesState: string;
}

export interface ContractPersonRef {
  DesFirstName: string;
  DesLastName1: string | null;
  DesEmail: string;
}

export interface ContractPerson {
  IdePerson: string;
  SPersonRol: { CodPersonRol: string; DesPersonRol: string };
  TPerson: ContractPersonRef;
  SState: ContractStateRef;
}

export interface ContractBillingPeriod {
  IdeContractBilling: string;
  NumPeriod: number;
  TstInitial: string;
  TstEnd: string;
  SState: ContractStateRef;
}

export interface ContractReceipt {
  IdeReceipt: string;
  /** Para el popup de recibos por movimiento (pestaña "Movimientos") --
   *  filtra los recibos ya cargados a nivel de contrato por el
   *  `IdeContractOperation` de la operación seleccionada, sin pedirle
   *  nada nuevo al backend. */
  IdeContractOperation: string;
  NumReceipt: string;
  TstIssue: string;
  TstInitial: string;
  TstEnd: string;
  Prime: DecimalString;
  Fee: DecimalString;
  SReceiptType: { CodReceiptType: string; DesReceiptType: string };
  SState: ContractStateRef;
}

/** `TContractDistributionChannel` -- `SDistributionChannel` no es una
 *  relación de Prisma (ver el comentario de `ContractsService.findOne`
 *  en el backend real, columna sin FK real en la BD); se resuelve a
 *  mano ahí y llega ya mezclada acá. */
export interface ContractDistributionChannel {
  IdeContractDistributionChannel: string;
  Percentaje: DecimalString;
  IndMain: boolean;
  NumMovement: number;
  TstInitial: string;
  TstEnd: string;
  SState: ContractStateRef;
  SDistributionChannel: { DesDistributionChannel: string } | null;
}

/** `TContractOperationDocument` -- `DocumentData` es el `Json` crudo tal
 *  como lo dejó la cascada (hoy sin uso real todavía, ver
 *  `ContractsService.create` en el backend: esta fase no genera
 *  documentos de operación). */
export interface ContractOperationDocument {
  IdeContractOperationDocument: string;
  DocumentData: unknown;
  TstRequest: string;
  SState: ContractStateRef;
}

/** `TContractOperation` -- "Movimientos/Operaciones" del contrato (alta,
 *  anulación, futuros endosos/suplementos). `SOperationProduct.SOperation`
 *  da el tipo real (`DesOperation`, ej. "Alta"/"Anulación"). */
export interface ContractOperation {
  IdeContractOperation: string;
  NumOperation: number;
  Data: unknown;
  TstRequest: string;
  SState: ContractStateRef;
  SOperationProduct: {
    SOperation: { CodOperation: string; DesOperation: string };
    SProcess: { CodProcess: string; DesProcess: string };
  };
  TContractOperationDocument: ContractOperationDocument[];
}

/** `TRiskCoverage` -- monto/tasa/prima leen sus propios escalares
 *  (confirmado: `Prime` ya llega descontado/recargado desde
 *  `TQuoteCoverage` al contratar, ver el comentario del backend real
 *  en `ContractsService.copyRisksAndCoverages`), no hace falta agregar
 *  `TCoverageMovement`. */
export interface ContractCoverage {
  IdeRiskCoverage: string;
  SCoveragePlan: { DesShort: string | null; DesLarge: string | null };
  SState: ContractStateRef;
  Amount: DecimalString;
  Rate: DecimalString;
  Prime: DecimalString;
  TstInitial: string;
  TstEnd: string;
}

/** `TContractRequirement` -- requisitos copiados de la cotización al
 *  contratar (documentación a presentar, ej. DNI/comprobante), por
 *  riesgo y opcionalmente por cobertura puntual. `Data` es el `Json`
 *  crudo (hoy sin uso real, mismo criterio que `ContractOperation.Data`). */
export interface ContractRequirement {
  IdeContractRequirement: string;
  Data: unknown;
  SState: ContractStateRef;
  SProductRequirement: {
    DesShort: string | null;
    DesLarge: string | null;
    IndMandatory: boolean;
    SRequirement: { CodRequirement: string; DesRequirement: string };
  };
}

export interface ContractRisk {
  IdeFileRisk: string;
  NumFileRisk: number;
  DesFileRisk: string | null;
  SRiskProduct: { IdeRiskProduct: string; DesShort: string | null; DesLarge: string | null };
  /** Plan del riesgo (columna "Plan") -- `SPlanProductRisk` no tiene su
   *  propia descripción, hay que leer `SPlanProduct.DesShort`/
   *  `DesPlanProduct` (ver el comentario del backend real). */
  SPlanProductRisk: { SPlanProduct: { DesShort: string | null; DesPlanProduct: string } };
  TstInclusion: string;
  TstInitial: string;
  TstEnd: string;
  /** Valores de atributos personalizables (`{ IdeAttributeProperty: valor }`,
   *  ver `RiskAttributesService`/`AttributePropertiesService` en el
   *  backend real) -- se resuelven a etiquetas legibles con
   *  `RiskAttributesService.getSchema(SRiskProduct.IdeRiskProduct)` al
   *  abrir el popup de "atributos personalizados". */
  RiskAttributeValue: Record<string, unknown> | null;
  SState: ContractStateRef;
  TRiskCoverage: ContractCoverage[];
  TContractRequirement: ContractRequirement[];
}

/** Personas por archivo (miembros de un colectivo) -- hoy vacío en la
 *  práctica, ver el comentario de `ContractsService.findOne` en el
 *  backend real. */
export interface ContractFilePerson {
  IdePerson: string;
  SPersonRol: { CodPersonRol: string; DesPersonRol: string };
  TPerson: ContractPersonRef;
}

export interface ContractFile {
  IdeContractFile: string;
  NumContractFile: number;
  TstInclusion: string;
  TstInitial: string;
  TstEnd: string;
  SState: ContractStateRef;
  TContractFilePerson: ContractFilePerson[];
  TFileRisk: ContractRisk[];
}

export interface ContractDetail {
  IdeContract: string;
  NumContract: string;
  TstInitial: string;
  TstEnd: string | null;
  TstSubscription: string;
  SProduct: { DesProduct: string; SCurrency: { SymbolCurrency: string } };
  SValidityType: { DesValidityType: string };
  SPaymentFraction: { DesPaymentFraction: string };
  SState: ContractStateRef;
  TContractPerson: ContractPerson[];
  TContractBilling: ContractBillingPeriod[];
  TReceipt: ContractReceipt[];
  TContractDistributionChannel: ContractDistributionChannel[];
  TContractOperation: ContractOperation[];
  TContractFile: ContractFile[];
}

/** Cliente HTTP contra `underwriting-service` (`/underwriting/contracts`,
 *  vía el gateway) -- mismo criterio que `QuotingService`: no reutiliza
 *  `CatalogService` porque estas rutas no siguen su shape Cod/Des
 *  simple. Pantalla de listado + detalle de contrato (ver
 *  docs/02-roadmap.md, pendiente cerrado a pedido explícito del
 *  usuario). Deliberadamente sin `create()`/mutaciones acá -- un
 *  contrato solo se genera desde el wizard de Cotización
 *  (`QuotingService.generateContract`), nunca directamente. */
@Injectable({ providedIn: 'root' })
export class ContractsService {
  private readonly base = `${environment.apiUrl}/underwriting/contracts`;

  constructor(private readonly http: HttpClient) {}

  /** `GET /contracts` (plural), paginado/filtrable -- ver `ListContractsParams`. */
  list(params: ListContractsParams): Observable<ContractListResponse> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http.get<ContractListResponse>(this.base, { params: httpParams });
  }

  /** `GET /contracts/:id` -- detalle completo de un contrato puntual. */
  getContract(ideContract: string): Observable<ContractDetail> {
    return this.http.get<ContractDetail>(`${this.base}/${ideContract}`);
  }
}
