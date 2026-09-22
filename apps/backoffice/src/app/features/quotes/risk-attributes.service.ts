import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Un validador de `AttributeContent` (confirmado contra datos reales,
 * ver `ModelAttributesService.getSchemaForReference` en
 * `reference-data-service`): `validationName` mapea 1:1 a un
 * `Validators` de Angular (`required`/`min`/`max`/`maxLength`); uno no
 * reconocido se ignora sin romper el formulario (forward-compatible). */
export interface RiskAttributeValidator {
  validationName: string;
  aditionalProps?: Record<string, unknown>;
}

/** Opción de un campo `select`/`radio`. Para `select`, `value` es
 * siempre un `IdeFieldValue` real (resuelto server-side contra
 * `SFieldValue` vigente -- ver comentario del backend); para `radio` sin
 * diccionario de valores (ej. "¿Esterilizado?"), puede ser un literal
 * (`true`/`false`). */
export interface RiskAttributeFieldOption {
  key: string;
  value: unknown;
}

export interface RiskAttributeField {
  ideAttributeProperty: string;
  codAttributeProperty: string;
  name: string;
  label: string;
  type: string;
  validators: RiskAttributeValidator[];
  validationMessages: Record<string, string>;
  options?: RiskAttributeFieldOption[];
}

export interface RiskAttributeSchema {
  fields: RiskAttributeField[];
}

/** Cliente HTTP contra `reference-data-service`
 * (`/reference-data/model-attributes`, vía el gateway) para el schema de
 * formulario dinámico de un riesgo (Etapa 1 de Cotización): qué campos
 * personalizados hay que pintar para un `IdeRiskProduct` dado (ej.
 * "Raza" para "Perro"), con sus opciones reales ya resueltas. Ver
 * `docs/02-roadmap.md` -- motor de atributos personalizables. */
@Injectable({ providedIn: 'root' })
export class RiskAttributesService {
  private readonly base = `${environment.apiUrl}/reference-data/model-attributes`;

  constructor(private readonly http: HttpClient) {}

  getSchema(ideRiskProduct: string): Observable<RiskAttributeSchema> {
    return this.http.get<RiskAttributeSchema>(`${this.base}/by-reference/${ideRiskProduct}/schema`);
  }
}
