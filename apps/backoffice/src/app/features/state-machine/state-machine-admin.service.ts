import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/reference-data/state-machine-admin`;

export interface StateItem {
  ideState: string;
  codState: string;
  desState: string;
  ruleCount: number;
}

export interface EntityItem {
  ideEntity: string;
  codEntity: string;
  desEntity: string;
  ruleCount: number;
  hasInitialRule: boolean;
}

export interface RuleItem {
  ideStateRule: string;
  ideStateFrom: string;
  codStateFrom: string;
  desStateFrom: string;
  ideStateTo: string;
  codStateTo: string;
  desStateTo: string;
  desOperativeCode: string | null;
  indInitialState: boolean;
  /** `null` = la entidad no tiene tabla con `IdeState` (sin conteo). */
  rowsInFromState: number | null;
}

export interface EntityRules {
  entity: { ideEntity: string; codEntity: string; desEntity: string };
  hasTable: boolean;
  rules: RuleItem[];
}

export interface RulePayload {
  ideStateFrom: string;
  ideStateTo: string;
  desOperativeCode: string;
  indInitialState: boolean;
}

export interface DiagnosticProblem {
  severity: 'error' | 'warning';
  kind: string;
  codEntity: string;
  message: string;
}

export interface Diagnostics {
  entitiesChecked: number;
  rulesChecked: number;
  entitiesWithoutRules: number;
  problems: DiagnosticProblem[];
}

/** Cliente de `state-machine-admin` (`reference-data-service`). */
@Injectable({ providedIn: 'root' })
export class StateMachineAdminService {
  private readonly http = inject(HttpClient);

  listStates(): Observable<StateItem[]> {
    return this.http.get<StateItem[]>(`${BASE}/states`);
  }
  createState(body: { codState: string; desState: string }): Observable<StateItem> {
    return this.http.post<StateItem>(`${BASE}/states`, body);
  }
  updateState(id: string, body: { desState: string }): Observable<unknown> {
    return this.http.patch(`${BASE}/states/${id}`, body);
  }
  deleteState(id: string): Observable<unknown> {
    return this.http.delete(`${BASE}/states/${id}`);
  }

  listEntities(): Observable<EntityItem[]> {
    return this.http.get<EntityItem[]>(`${BASE}/entities`);
  }
  createEntity(body: { codEntity: string; desEntity: string }): Observable<EntityItem> {
    return this.http.post<EntityItem>(`${BASE}/entities`, body);
  }
  updateEntity(id: string, body: { desEntity: string }): Observable<unknown> {
    return this.http.patch(`${BASE}/entities/${id}`, body);
  }
  deleteEntity(id: string): Observable<unknown> {
    return this.http.delete(`${BASE}/entities/${id}`);
  }

  listRules(ideEntity: string): Observable<EntityRules> {
    return this.http.get<EntityRules>(`${BASE}/entities/${ideEntity}/rules`);
  }
  createRule(body: RulePayload & { ideEntity: string }): Observable<unknown> {
    return this.http.post(`${BASE}/rules`, body);
  }
  updateRule(id: string, body: RulePayload): Observable<unknown> {
    return this.http.patch(`${BASE}/rules/${id}`, body);
  }
  deleteRule(id: string, force: boolean): Observable<unknown> {
    let params = new HttpParams();
    if (force) params = params.set('force', 'true');
    return this.http.delete(`${BASE}/rules/${id}`, { params });
  }

  diagnostics(): Observable<Diagnostics> {
    return this.http.get<Diagnostics>(`${BASE}/diagnostics`);
  }
}
