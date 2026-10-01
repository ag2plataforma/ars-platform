import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Un job registrado en el backend (ver `BackgroundJobHandler`,
 *  underwriting-service) con su configuración actual. */
export interface BackgroundJobItem {
  codJob: string;
  desJob: string;
  indActive: boolean;
  numHour: number;
  numMinute: number;
}

/** Una fila de `GET /background-jobs/:codJob/runs` (historial de corridas). */
export interface BackgroundJobRun {
  ideBackgroundJobRun: string;
  tstStart: string;
  tstEnd: string;
  indManual: boolean;
  numSucceeded: number;
  numFailed: number;
  numSkipped: number;
  desDetail: string | null;
  desError: string | null;
}

export interface BackgroundJobRunListResponse {
  items: BackgroundJobRun[];
  total: number;
  page: number;
  limit: number;
}

export interface UpdateBackgroundJobConfigPayload {
  indActive: boolean;
  numHour: number;
  numMinute: number;
}

/** Cliente HTTP contra `underwriting-service`
 *  (`/underwriting/background-jobs`) -- pantalla genérica "Trabajos
 *  Programados" (Etapa 3 de "Gestión de renovaciones", ver
 *  docs/02-roadmap.md; rediseñada a pedido explícito del usuario,
 *  2026-10-01, para servir a cualquier proceso en segundo plano futuro,
 *  no solo renovaciones). */
@Injectable({ providedIn: 'root' })
export class BackgroundJobsService {
  private readonly base = `${environment.apiUrl}/underwriting/background-jobs`;

  constructor(private readonly http: HttpClient) {}

  /** `GET /background-jobs` -- un ítem por cada job registrado en el backend. */
  list(): Observable<BackgroundJobItem[]> {
    return this.http.get<BackgroundJobItem[]>(this.base);
  }

  /** `PATCH /background-jobs/:codJob/config` -- horario/activo. */
  updateConfig(codJob: string, payload: UpdateBackgroundJobConfigPayload): Observable<BackgroundJobItem> {
    return this.http.patch<BackgroundJobItem>(`${this.base}/${codJob}/config`, payload);
  }

  /** `GET /background-jobs/:codJob/runs` -- historial paginado, más reciente primero. */
  listRuns(codJob: string, page: number, limit: number): Observable<BackgroundJobRunListResponse> {
    const params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    return this.http.get<BackgroundJobRunListResponse>(`${this.base}/${codJob}/runs`, { params });
  }

  /** `POST /background-jobs/:codJob/runs/run-now` -- dispara el job
   *  manualmente, sin esperar al horario programado. */
  runNow(codJob: string): Observable<BackgroundJobRun> {
    return this.http.post<BackgroundJobRun>(`${this.base}/${codJob}/runs/run-now`, {});
  }
}
