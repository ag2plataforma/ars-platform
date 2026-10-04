import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/documents/tasks`;

export type TaskStatus = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADA' | 'FALLIDA' | 'CANCELADA';

export const TASK_STATUSES: TaskStatus[] = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'FALLIDA', 'CANCELADA'];

/** Tipos de tarea conocidos (los que tienen handler en documents-service). */
export const TASK_TYPES = [
  'GENERATE_DOCUMENT',
  'WELCOME_EMAIL',
  'WELCOME_SMS',
  'RENEWAL_NOTICE_EMAIL',
  'RENEWAL_NOTICE_SMS',
];

export interface QueueTask {
  ideBackgroundTask: string;
  codTaskType: string;
  ideEntity: string | null;
  numContract: string | null;
  codStatus: TaskStatus;
  numAttempts: number;
  numMaxAttempts: number;
  tstNextAttempt: string;
  tstFinished: string | null;
  desError: string | null;
  usrCreation: string | null;
  tstCreation: string;
  codTemplateType: string | null;
  ideContractOperationDocument: string | null;
  desSkipReason: string | null;
}

export interface QueueTaskDetail extends QueueTask {
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
}

export interface QueueSummary {
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

export interface TaskPage {
  items: QueueTask[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class TaskQueueService {
  private readonly http = inject(HttpClient);

  list(params: { page: number; limit: number; status?: string; codTaskType?: string }): Observable<TaskPage> {
    let p = new HttpParams().set('page', params.page).set('limit', params.limit);
    if (params.status) p = p.set('status', params.status);
    if (params.codTaskType) p = p.set('type', params.codTaskType);
    return this.http.get<TaskPage>(BASE, { params: p });
  }

  summary(): Observable<QueueSummary> {
    return this.http.get<QueueSummary>(`${BASE}/summary`);
  }

  detail(ide: string): Observable<QueueTaskDetail> {
    return this.http.get<QueueTaskDetail>(`${BASE}/${ide}`);
  }

  retry(ide: string): Observable<QueueTask> {
    return this.http.post<QueueTask>(`${BASE}/${ide}/retry`, {});
  }

  cancel(ide: string): Observable<QueueTask> {
    return this.http.post<QueueTask>(`${BASE}/${ide}/cancel`, {});
  }
}
