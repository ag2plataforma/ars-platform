import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** `TPerson` real (`party-service`), tal como lo devuelve
 * `PersonsService.findOne`/`create`/`lookup` -- objeto Prisma crudo
 * (PascalCase), igual criterio que `CreateQuoteResponse` en
 * `quoting.service.ts`. Solo se listan acá los campos que esta pantalla
 * usa (buscar/crear Tomador y Titular); `TPerson` tiene más columnas
 * demográficas opcionales que esta etapa no expone todavía. */
export interface Person {
  IdePerson: string;
  DesFirstName: string;
  DesMiddleName: string | null;
  DesLastName1: string | null;
  DesLastName2: string | null;
  DesEmail: string;
  NumIdentification: string | null;
}

export interface LookupPersonCriteria {
  numIdentification?: string;
  email?: string;
}

export interface CreatePersonPayload {
  desFirstName: string;
  desLastName1?: string;
  desEmail: string;
  numIdentification?: string;
}

/** `CodContactClass` real, confirmado explícitamente con el usuario (no
 * adivinado), para "Teléfono móvil" -- ver `ContractsService.
 * assertPersonsReadyForIssuance` en `underwriting-service`, que exige
 * este mismo código para poder generar el contrato. */
export const MOBILE_PHONE_CONTACT_CLASS = 'MOBILE_PHONE';

export interface CreateAddressPayload {
  desAddressLine1: string;
  desAddressLine2?: string;
  codPostal: string;
}

export interface CreateContactDataPayload {
  codContactClass: string;
  desContactData: string;
}

/** Cliente HTTP contra `party-service` (`/party/persons`, vía el
 * gateway) para el paso "Personas" de Cotización: buscar una persona
 * existente (`GET /persons/lookup`, equivalente a `FPerson_GetBy`),
 * crear una nueva (`POST /persons`) para asociarla a la cotización
 * (`QuotingService.setPerson`), y completar dirección
 * (`POST :id/addresses`) y teléfono móvil (`POST :id/contact-data`) --
 * ambos exigidos por `ContractsService.assertPersonsReadyForIssuance`
 * antes de poder generar el contrato (ver docs/02-roadmap.md). No
 * reutiliza `CatalogService` porque `TPerson` no tiene shape Cod/Des de
 * catálogo simple. */
@Injectable({ providedIn: 'root' })
export class PersonsService {
  private readonly base = `${environment.apiUrl}/party/persons`;

  constructor(private readonly http: HttpClient) {}

  lookup(criteria: LookupPersonCriteria): Observable<Person> {
    let params = new HttpParams();
    if (criteria.numIdentification) params = params.set('numIdentification', criteria.numIdentification);
    if (criteria.email) params = params.set('email', criteria.email);
    return this.http.get<Person>(`${this.base}/lookup`, { params });
  }

  create(payload: CreatePersonPayload): Observable<Person> {
    return this.http.post<Person>(this.base, payload);
  }

  addAddress(idePerson: string, payload: CreateAddressPayload): Observable<unknown> {
    return this.http.post(`${this.base}/${idePerson}/addresses`, payload);
  }

  addContactData(idePerson: string, payload: CreateContactDataPayload): Observable<unknown> {
    return this.http.post(`${this.base}/${idePerson}/contact-data`, payload);
  }

  addMobilePhone(idePerson: string, desContactData: string): Observable<unknown> {
    return this.addContactData(idePerson, { codContactClass: MOBILE_PHONE_CONTACT_CLASS, desContactData });
  }
}
