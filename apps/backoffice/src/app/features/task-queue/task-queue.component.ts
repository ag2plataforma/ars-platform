import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import {
  QueueSummary,
  QueueTask,
  QueueTaskDetail,
  TASK_STATUSES,
  TASK_TYPES,
  TaskQueueService,
  TaskStatus,
} from './task-queue.service';

const POLL_MS = 5000;

type Severity = 'success' | 'danger' | 'info' | 'warn' | 'secondary';

/**
 * Vista global de la cola en segundo plano (`TBackgroundTask`): todas las
 * tareas de todos los contratos, con contadores por estado, filtros,
 * detalle (payload/resultado), reintento de las FALLIDAS y cancelación de
 * las PENDIENTES (solo ADMIN). Refresco automático opcional cada 5 s.
 */
@Component({
  selector: 'app-task-queue',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DialogModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    TooltipModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './task-queue.component.html',
})
export class TaskQueueComponent implements OnDestroy {
  private readonly api = inject(TaskQueueService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly statuses = TASK_STATUSES;
  readonly items = signal<QueueTask[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly summary = signal<QueueSummary>({ byStatus: {}, byType: {} });
  readonly isAdmin = computed(() => this.auth.payload()?.role === 'ADMIN');

  readonly statusFilter = signal<TaskStatus | ''>('');
  readonly typeFilter = signal<string>('');
  readonly autoRefresh = signal(true);

  /** Tipos conocidos + cualquier otro que ya exista en la tabla. */
  readonly typeOptions = computed(() => {
    const codes = new Set<string>([...TASK_TYPES, ...Object.keys(this.summary().byType)]);
    return [...codes].map((code) => ({ code, label: this.typeLabel(code) }));
  });

  readonly detailVisible = signal(false);
  readonly detail = signal<QueueTaskDetail | null>(null);
  readonly detailJson = computed(() => {
    const d = this.detail();
    return d ? JSON.stringify({ payload: d.payload, result: d.result }, null, 2) : '';
  });

  private first = 0;
  private rows = 25;
  private pollTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    clearTimeout(this.pollTimer);
  }

  /** `(onLazyLoad)` de `p-table`: primera carga y cambios de página. */
  load(event: TableLazyLoadEvent): void {
    this.rows = event.rows ?? this.rows;
    this.first = event.first ?? 0;
    this.refresh(true);
  }

  private refresh(showSpinner: boolean): void {
    clearTimeout(this.pollTimer);
    if (showSpinner) this.loading.set(true);
    const page = Math.floor(this.first / this.rows) + 1;
    this.api
      .list({
        page,
        limit: this.rows,
        status: this.statusFilter() || undefined,
        codTaskType: this.typeFilter() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
          this.schedulePoll();
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.showError(err);
          this.schedulePoll();
        },
      });
    this.api.summary().subscribe({ next: (s) => this.summary.set(s) });
  }

  private schedulePoll(): void {
    clearTimeout(this.pollTimer);
    if (this.autoRefresh()) this.pollTimer = setTimeout(() => this.refresh(false), POLL_MS);
  }

  reload(): void {
    this.refresh(true);
  }

  toggleAutoRefresh(value: boolean): void {
    this.autoRefresh.set(value);
    if (value) this.refresh(false);
    else clearTimeout(this.pollTimer);
  }

  /** Cualquier cambio de filtro vuelve a la página 1. */
  setStatusFilter(status: TaskStatus | '' | null): void {
    this.statusFilter.set(status ?? '');
    this.first = 0;
    this.refresh(true);
  }

  setTypeFilter(type: string | null): void {
    this.typeFilter.set(type ?? '');
    this.first = 0;
    this.refresh(true);
  }

  count(status: TaskStatus): number {
    return this.summary().byStatus[status] ?? 0;
  }

  statusSeverity(status: TaskStatus): Severity {
    return (
      { COMPLETADA: 'success', FALLIDA: 'danger', EN_PROCESO: 'info', PENDIENTE: 'warn', CANCELADA: 'secondary' } as Record<
        TaskStatus,
        Severity
      >
    )[status];
  }

  typeLabel(code: string): string {
    const key = `taskQueue.types.${code}`;
    const label = this.transloco.translate<string>(key);
    return label === key ? code : label;
  }

  taskLabel(task: QueueTask): string {
    const base = this.typeLabel(task.codTaskType);
    return task.codTaskType === 'GENERATE_DOCUMENT' && task.codTemplateType ? `${base}: ${task.codTemplateType}` : base;
  }

  /** Error o motivo de omisión (lo que el operador necesita ver en la fila). */
  note(task: QueueTask): string {
    if (task.codStatus === 'COMPLETADA') return task.desSkipReason ?? '';
    return task.desError ?? '';
  }

  openDetail(task: QueueTask): void {
    this.detail.set(null);
    this.detailVisible.set(true);
    this.api.detail(task.ideBackgroundTask).subscribe({
      next: (d) => this.detail.set(d),
      error: (err: HttpErrorResponse) => {
        this.detailVisible.set(false);
        this.showError(err);
      },
    });
  }

  retry(task: QueueTask): void {
    this.api.retry(task.ideBackgroundTask).subscribe({
      next: () => {
        this.messages.add({ severity: 'success', detail: this.transloco.translate<string>('taskQueue.retried') });
        this.refresh(false);
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  cancel(task: QueueTask): void {
    this.confirm.confirm({
      header: this.transloco.translate('taskQueue.cancelHeader'),
      message: this.transloco.translate('taskQueue.cancelConfirm', { type: this.taskLabel(task) }),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () =>
        this.api.cancel(task.ideBackgroundTask).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', detail: this.transloco.translate<string>('taskQueue.cancelled') });
            this.refresh(false);
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        }),
    });
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
