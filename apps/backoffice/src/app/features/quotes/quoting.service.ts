import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Formas del JSON real que devuelve `underwriting-service`
 * (`QuotesService.buildPricingResult`, ver su README/código fuente --
 * la forma de esta respuesta es una decisión de API propia del backend,
 * no una réplica literal de `FQuote('QUOTEPRICING',...)`; el algoritmo y
 * los valores sí lo son). */
export interface QuoteCoverage {
  ideQuoteCoverage: string;
  desShortCoverage: string | null;
  desLargeCoverage: string | null;
  indSelected: boolean;
  amount: number;
  rate: number;
  prime: number;
}

export interface QuotePlanUnit {
  desUnitBase: string;
  unit: number;
  desUnit: string;
}

export interface QuotePlan {
  ideQuoteRiskPlan: string;
  indSelected: boolean;
  codPlanProduct: string;
  desShortPlan: string | null;
  desLargePlan: string | null;
  basePrice: number;
  unit: QuotePlanUnit;
  mandatoryCoverages: QuoteCoverage[];
  optionalCoverages: QuoteCoverage[];
}

export interface QuoteRisk {
  ideQuoteRisk: string;
  numRisk: number;
  desRisk: string;
  plans: QuotePlan[];
}

/** `GET /quotes/:id` -- el asociado (`TContract`), si ya se generó. */
export interface QuoteContractRef {
  ideContract: string;
  numContract: string;
}

/** `socialImpact` de `GET/POST /quotes/:id(/price)` -- Fase 3, Etapa 2
 *  (ver docs/02-roadmap.md): tres formas posibles, mismo discriminador
 *  `active`/`answered` que usa el backend real
 *  (`QuotesService.resolveSocialImpact`). `{ active: false }` es el caso
 *  normal para la inmensa mayoría de productos, que no participan. */
export type SocialImpactInfo =
  | { active: false }
  | { active: true; answered: false }
  | {
      active: true;
      answered: true;
      kgCo2Year: number;
      cfpScore: number;
      sipScore: number;
      combinedScore: number;
      pctPrimaAdjustment: number;
    };

export interface QuotePricingResult {
  ideQuote: string;
  numQuote: string;
  symbolCurrency: string;
  /** `SState.CodState`/`DesState` de la cotización -- agregado para
   *  poder "retomar" una existente desde el listado sin reconstruir la
   *  Etapa 1 (ver `QuotesComponent.resumeQuote` y docs/02-roadmap.md). */
  codState: string;
  desState: string;
  /** No-null solo si ya se generó un contrato para esta cotización. */
  contract: QuoteContractRef | null;
  socialImpact: SocialImpactInfo;
  risks: QuoteRisk[];
}

export interface CreateQuoteRiskPayload {
  codRiskProduct: string;
  /** `{ [IdeAttributeProperty]: valor }` -- campos personalizados del
   * riesgo (ej. "Raza" para un perro), ver `RiskAttributesService` y
   * `CreateQuoteRiskDto.riskAttributeValue` en el backend real.
   * Opcional: un riesgo sin motor de atributos configurado no manda nada. */
  riskAttributeValue?: Record<string, unknown>;
}

export interface CreateQuotePayload {
  codProduct: string;
  codDistributionChannel: string;
  codDistributionWay: string;
  risks: CreateQuoteRiskPayload[];
}

/** Una fila de `GET /quotes` (plural) -- deliberadamente liviana (sin
 *  coberturas/planes/montos, que solo hacen falta al abrir UNA
 *  cotización puntual), ver `QuotesService.findAll` en el backend real. */
export interface QuoteListItem {
  ideQuote: string;
  numQuote: string;
  desProduct: string;
  codState: string;
  desState: string;
  tstCreation: string;
  usrCreation: string;
  tomador: { name: string; lastname: string | null } | null;
}

export interface QuoteListResponse {
  items: QuoteListItem[];
  total: number;
  page: number;
  limit: number;
}

/** Filtros de `GET /quotes` -- mismo shape que `ListQuotesDto` en el
 *  backend real (ver `quoting.service.ts` allá). Todo opcional. */
export interface ListQuotesParams {
  codProduct?: string;
  codState?: string;
  dateFrom?: string;
  dateTo?: string;
  all?: boolean;
  page?: number;
  limit?: number;
  /** Ver `ListQuotesDto.sortField`/`.sortOrder`/`.filterNumQuote` en el
   *  backend real -- misma lista cerrada de columnas ordenables. */
  sortField?: string;
  sortOrder?: number;
  filterNumQuote?: string;
}

interface CreateQuoteResponse {
  IdeQuote: string;
  NumQuote: string;
}

/** Formulario de Impacto Social (nuevo paso del wizard de Cotización,
 *  Fase 3 Etapa 2, ver docs/02-roadmap.md) -- reenviado tal cual a
 *  `POST :id/social-impact-answers`. `country` queda deliberadamente
 *  afuera de este formulario (opcional en el backend, que ya cae a un
 *  país por defecto configurado en la fórmula si no se manda). */
export interface SubmitSocialImpactAnswersPayload {
  carKmPerYear: number;
  carFuelType: string;
  electricityKwhMonth: number;
  flightsPerYear: number;
  volunteerHoursPerYear: number;
  recurringCause: boolean;
  regularDonations: boolean;
}

/** `QuotesService.getSummary` (equivalente a `FGetQuoteSummary`) --
 * shape propio del backend, confirmado contra su código real. */
export interface QuoteSummaryPerson {
  name: string;
  lastname: string | null;
  email: string;
  identificationNumber: string | null;
}

export interface QuoteSummaryCoverage {
  desShortCoverage: string | null;
  coveragePrime: number;
  symbolCurrency: string;
}

export interface QuoteSummaryRisk {
  desShortRiskProduct: string;
  coverages: QuoteSummaryCoverage[];
  riskAttributeValue: unknown;
}

/** `AdjustmentValueResolver.listAppliedAdjustments` (backend, Fase 3,
 * motor genérico de recargos/descuentos -- ver docs/02-roadmap.md):
 * detalle de un recargo/descuento ya calculado y aplicado a la
 * cotización. `codAdjustment` es genérico a propósito -- hoy solo
 * existe `'SOCIAL_IMPACT'`, ver `appliedAdjustmentLabel` en
 * `QuotesComponent` para el mapeo a una etiqueta traducida. */
export interface QuoteSummaryAppliedAdjustment {
  codAdjustment: string;
  pctPrimaAdjustment: number;
  /** Importe en moneda del ajuste (ya calculado en el backend a partir de
   *  `quotePrime` y `pctPrimaAdjustment` -- ver `QuotesService.getSummary`),
   *  no solo el `%` -- negativo = descuento, positivo = recargo, misma
   *  convención de signo que `pctPrimaAdjustment`. */
  amountPrimaAdjustment: number;
}

export interface QuoteSummary {
  symbolCurrency: string;
  plan: string | null;
  quotePrime: number;
  appliedAdjustments: QuoteSummaryAppliedAdjustment[];
  personPayer: QuoteSummaryPerson | null;
  personHolder: QuoteSummaryPerson | null;
  riskInfo: QuoteSummaryRisk[];
}

/** `TAddress`/`TContactData` activos de una persona, tal como los anida
 * `QuotesService.listPersons` (y `PersonsService.findOne`/`lookup` en
 * `party-service`) -- ver `docs/02-roadmap.md`, requisito de dirección y
 * teléfono móvil para poder generar el contrato. */
export interface PersonAddress {
  IdeAddress: string;
  DesAddressLine1: string;
  DesAddressLine2: string | null;
  CodPostal: string;
  IndMain: boolean;
}

export interface PersonContactData {
  IdeContactData: string;
  DesContactData: string;
  IndMain: boolean;
  SContactClass: { CodContactClass: string; DesContactClass: string };
}

/** `TQuotePerson` con sus relaciones incluidas (`GET :id/persons`),
 * objeto Prisma crudo (PascalCase). */
export interface QuotePerson {
  IdeQuotePerson: string;
  IdePerson: string;
  IdePersonRol: string;
  TPerson: {
    IdePerson: string;
    DesFirstName: string;
    DesLastName1: string | null;
    DesEmail: string;
    TAddress: PersonAddress[];
    TContactData: PersonContactData[];
  };
  SPersonRol: { CodPersonRol: string; DesPersonRol: string };
}

interface CreateContractResponse {
  IdeContract: string;
  NumContract: string;
}

/** Cliente HTTP contra `underwriting-service` (`/underwriting/quotes`,
 * vía el gateway) -- no reutiliza `CatalogService` porque estas rutas no
 * siguen su shape (`POST /:id/price`, `PATCH` anidado con múltiples ids
 * en el path, sin body en varios casos): son mutaciones propias del
 * motor de cotización, no un catálogo Cod/Des simple. Etapa 1 del
 * roadmap (ver docs/02-roadmap.md, Fase 2): crear + elegir riesgo/plan +
 * precio. Deliberadamente afuera todavía: personas, resumen, aceptar. */
@Injectable({ providedIn: 'root' })
export class QuotingService {
  private readonly base = `${environment.apiUrl}/underwriting/quotes`;

  constructor(private readonly http: HttpClient) {}

  create(payload: CreateQuotePayload): Observable<CreateQuoteResponse> {
    return this.http.post<CreateQuoteResponse>(this.base, payload);
  }

  /** `GET /quotes` (plural), paginado/filtrable -- ver `ListQuotesParams`. */
  list(params: ListQuotesParams): Observable<QuoteListResponse> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http.get<QuoteListResponse>(this.base, { params: httpParams });
  }

  /** `GET /quotes/:id` -- misma cotización que ya devuelve `price()`
   *  (`QuotesService.buildPricingResult`, ver el backend real), sin
   *  mutar nada -- usado para "retomar" una cotización existente desde
   *  el listado (ver `QuotesComponent.resumeQuote`). */
  getQuote(ideQuote: string): Observable<QuotePricingResult> {
    return this.http.get<QuotePricingResult>(`${this.base}/${ideQuote}`);
  }

  price(ideQuote: string): Observable<QuotePricingResult> {
    return this.http.post<QuotePricingResult>(`${this.base}/${ideQuote}/price`, {});
  }

  selectPlan(ideQuote: string, ideQuoteRisk: string, ideQuoteRiskPlan: string): Observable<QuotePricingResult> {
    return this.http.patch<QuotePricingResult>(
      `${this.base}/${ideQuote}/risks/${ideQuoteRisk}/plans/${ideQuoteRiskPlan}/select`,
      {},
    );
  }

  /** `PATCH :id/risk-plans/:ideQuoteRiskPlan/coverages/:ideQuoteCoverage`
   * (confirmado contra `quotes.controller.ts`/`ToggleCoverageDto` reales)
   * -- selecciona/deselecciona una cobertura opcional. Las obligatorias
   * no admiten esta llamada: el backend responde 409 (`ConflictException`)
   * si se intenta, por eso el frontend ni siquiera ofrece el toggle para
   * ellas (ver `quotes.component.html`). */
  toggleCoverage(
    ideQuote: string,
    ideQuoteRiskPlan: string,
    ideQuoteCoverage: string,
    selected: boolean,
  ): Observable<QuotePricingResult> {
    return this.http.patch<QuotePricingResult>(
      `${this.base}/${ideQuote}/risk-plans/${ideQuoteRiskPlan}/coverages/${ideQuoteCoverage}`,
      { selected },
    );
  }

  /** `GET :id/persons` -- personas ya asociadas a la cotización, con
   * persona y rol resueltos (`TPerson`/`SPersonRol`). */
  listPersons(ideQuote: string): Observable<QuotePerson[]> {
    return this.http.get<QuotePerson[]>(`${this.base}/${ideQuote}/persons`);
  }

  /** `PUT :id/persons` -- asocia una persona a un rol de la cotización.
   * Asignar un rol ya ocupado reemplaza a quien lo tuviera (regla real
   * del backend, no de este cliente). */
  setPerson(ideQuote: string, idePerson: string, codPersonRol: string): Observable<QuotePerson> {
    return this.http.put<QuotePerson>(`${this.base}/${ideQuote}/persons`, { idePerson, codPersonRol });
  }

  /** `GET :id/summary`, equivalente a `FGetQuoteSummary`. */
  getSummary(ideQuote: string): Observable<QuoteSummary> {
    return this.http.get<QuoteSummary>(`${this.base}/${ideQuote}/summary`);
  }

  /** `POST :id/social-impact-answers` -- dispara el cálculo real contra
   *  `social-impact-service` (llamada HTTP real entre servicios,
   *  Etapa 2) y devuelve el mismo `buildPricingResult` de siempre, ya
   *  con `socialImpact.answered: true` y el resultado persistido. */
  submitSocialImpactAnswers(
    ideQuote: string,
    payload: SubmitSocialImpactAnswersPayload,
  ): Observable<QuotePricingResult> {
    return this.http.post<QuotePricingResult>(`${this.base}/${ideQuote}/social-impact-answers`, payload);
  }

  /** `POST :id/state`, equivalente a `FQuote_SetState` -- aplica una
   * transición de estado a la cotización y a todo su árbol.
   * `codOperative` se expone tal cual (decisión ya documentada en el
   * backend), pero el único código real confirmado hasta ahora que
   * mueve una cotización a "Aceptado" es `'Aceptar'` (ver
   * `ContractsService.create`, que exige literalmente ese estado antes
   * de contratar) -- por eso `acceptQuote()` lo fija como convenience. */
  transitionState(ideQuote: string, codOperative: string): Observable<QuotePricingResult> {
    return this.http.post<QuotePricingResult>(`${this.base}/${ideQuote}/state`, { codOperative });
  }

  acceptQuote(ideQuote: string): Observable<QuotePricingResult> {
    return this.transitionState(ideQuote, 'Aceptar');
  }

  /** `POST :ideQuote/contract` -- ejecuta toda la cascada real de
   * creación de contrato (`ContractsService.create`, ver su README):
   * exige que la cotización ya esté en estado "Aceptado" y sin contrato
   * previo. `codPaymentFraction`/`initialDate` quedan afuera de esta
   * etapa (se usan los valores por defecto del backend: primera
   * fracción de pago vigente del producto y fecha actual) -- ver nota en
   * `docs/02-roadmap.md` sobre por qué esto no se puede probar de punta
   * a punta todavía contra la BD real. */
  createContract(ideQuote: string): Observable<CreateContractResponse> {
    return this.http.post<CreateContractResponse>(`${this.base}/${ideQuote}/contract`, {});
  }
}
