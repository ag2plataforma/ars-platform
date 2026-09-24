import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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

/** Resultado de `GET .../product-process-flows/resolve-steps` (ver el
 * doc-comment de `ProcessFlowResolver` en `@ars-platform/shared-common`):
 * `codProcessFlow: null` = no hay ningún flujo configurado para esta
 * combinación -- comportamiento por defecto SEGURO, no cambia nada de
 * lo que ya funcionaba. */
export interface ProcessFlowResolution {
  codProcessFlow: string | null;
  activeSteps: string[];
}

/** Código reservado del paso "Atributos personalizados" en el motor de
 * flujo configurable -- el usuario debe crear un `SStep` con este código
 * EXACTO desde la pantalla "Flujos de proceso" > "Catálogos" > Pasos
 * para que el gating funcione (mismo criterio que `'SOCIAL_IMPACT'` en
 * `codAdjustment`, hardcoded-pero-confirmado en otras partes del
 * código). */
export const STEP_CODE_CUSTOM_ATTRIBUTES = 'ATRIBUTOS_PERSONALIZADOS';

/** Cliente HTTP contra `reference-data-service`
 * (`/reference-data/model-attributes`, vía el gateway) para el schema de
 * formulario dinámico de un riesgo (Etapa 1 de Cotización): qué campos
 * personalizados hay que pintar para un `IdeRiskProduct` dado (ej.
 * "Raza" para "Perro"), con sus opciones reales ya resueltas. Ver
 * `docs/02-roadmap.md` -- motor de atributos personalizables. */
@Injectable({ providedIn: 'root' })
export class RiskAttributesService {
  private readonly base = `${environment.apiUrl}/reference-data/model-attributes`;
  private readonly resolveStepsUrl = `${environment.apiUrl}/reference-data/product-process-flows/resolve-steps`;

  constructor(private readonly http: HttpClient) {}

  getSchema(ideRiskProduct: string): Observable<RiskAttributeSchema> {
    return this.http.get<RiskAttributeSchema>(`${this.base}/by-reference/${ideRiskProduct}/schema`);
  }

  /**
   * Consulta si el paso "Atributos personalizados" está activo para esta
   * combinación producto/canal/riesgo/vía según `SProductProcessFlow`
   * (pedido explícito del usuario, 2026-09-23 -- ver el doc-comment de
   * `ProcessFlowResolver` en `@ars-platform/shared-common`). Se pasa
   * `codRiskProduct` para máxima especificidad ("más específica gana").
   */
  resolveActiveSteps(params: {
    codProduct: string;
    codDistributionChannel: string;
    codRiskProduct?: string;
    codDistributionWay?: string;
  }): Observable<ProcessFlowResolution> {
    let httpParams = new HttpParams()
      .set('codProduct', params.codProduct)
      .set('codDistributionChannel', params.codDistributionChannel);
    if (params.codRiskProduct) httpParams = httpParams.set('codRiskProduct', params.codRiskProduct);
    if (params.codDistributionWay) httpParams = httpParams.set('codDistributionWay', params.codDistributionWay);
    return this.http.get<ProcessFlowResolution>(this.resolveStepsUrl, { params: httpParams });
  }
}
