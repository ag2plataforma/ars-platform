import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  BackgroundJobsService,
  BackgroundJobItem,
  BackgroundJobRun,
} from './background-jobs.service';

/**
 * Pantalla genérica "Trabajos Programados" (Etapa 3 de "Gestión de
 * renovaciones", ver docs/02-roadmap.md; rediseñada a pedido explícito
 * del usuario, 2026-10-01, para administrar CUALQUIER
 * `BackgroundJobHandler` registrado en el backend -- hoy solo
 * "Renovación automática de contratos", pensada para que mañana se
 * sumen más sin tocar esta pantalla).
 *
 * Por cada job: configurar horario/activo (diálogo con form reactivo),
 * "Ejecutar ahora" y ver el historial de corridas (diálogo con tabla
 * paginada). Alcance "simple" acordado con el usuario: horario es solo
 * hora:minuto diario, no una expresión cron completa.
 */
@Component({
  selector: 'app-background-jobs',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputNumberModule,
    CheckboxModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './background-jobs.component.html',
})
export class BackgroundJobsComponent implements OnInit {
  private readonly jobsService = inject(BackgroundJobsService);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly jobs = signal<BackgroundJobItem[]>([]);
  readonly loading = signal(false);
  readonly runningCod = signal<string | null>(null);

  readonly configDialogVisible = signal(false);
  readonly configSaving = signal(false);
  private editingJob: BackgroundJobItem | null = null;
  configForm = this.fb.nonNullable.group({
    indActive: [false],
    numHour: [2, [Validators.required, Validators.min(0), Validators.max(23)]],
    numMinute: [0, [Validators.required, Validators.min(0), Validators.max(59)]],
  });

  readonly historyVisible = signal(false);
  readonly historyCodJob = signal<string | null>(null);
  readonly historyDesJob = signal('');
  readonly historyItems = signal<BackgroundJobRun[]>([]);
  readonly historyTotal = signal(0);
  readonly historyLoading = signal(false);
  private historyLastLimit = 20;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.jobsService.list().subscribe({
      next: (items) => {
        this.jobs.set(items);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.showError(err);
      },
    });
  }

  openConfig(item: BackgroundJobItem): void {
    this.editingJob = item;
    this.configForm.setValue({ indActive: item.indActive, numHour: item.numHour, numMinute: item.numMinute });
    this.configDialogVisible.set(true);
  }

  closeConfig(): void {
    this.configDialogVisible.set(false);
  }

  submitConfig(): void {
    if (this.configForm.invalid || !this.editingJob) {
      this.configForm.markAllAsTouched();
      return;
    }
    const codJob = this.editingJob.codJob;
    const raw = this.configForm.getRawValue();
    this.configSaving.set(true);
    this.jobsService.updateConfig(codJob, raw).subscribe({
      next: (updated) => {
        this.configSaving.set(false);
        this.jobs.update((rows) => rows.map((row) => (row.codJob === updated.codJob ? updated : row)));
        this.configDialogVisible.set(false);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('backgroundJobs.savedDetail'),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.configSaving.set(false);
        this.showError(err);
      },
    });
  }

  runNow(item: BackgroundJobItem): void {
    this.runningCod.set(item.codJob);
    this.jobsService.runNow(item.codJob).subscribe({
      next: () => {
        this.runningCod.set(null);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('backgroundJobs.runNowDetail'),
        });
        if (this.historyCodJob() === item.codJob) {
          this.fetchHistory(1, this.historyLastLimit);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.runningCod.set(null);
        this.showError(err);
      },
    });
  }

  openHistory(item: BackgroundJobItem): void {
    this.historyCodJob.set(item.codJob);
    this.historyDesJob.set(item.desJob);
    this.historyVisible.set(true);
    this.fetchHistory(1, this.historyLastLimit);
  }

  loadHistory(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.historyLastLimit;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    this.fetchHistory(page, rows);
  }

  private fetchHistory(page: number, limit: number): void {
    const codJob = this.historyCodJob();
    if (!codJob) return;
    this.historyLastLimit = limit;
    this.historyLoading.set(true);
    this.jobsService.listRuns(codJob, page, limit).subscribe({
      next: (result) => {
        this.historyItems.set(result.items);
        this.historyTotal.set(result.total);
        this.historyLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.historyLoading.set(false);
        this.showError(err);
      },
    });
  }

  schedule(item: BackgroundJobItem): string {
    return `${String(item.numHour).padStart(2, '0')}:${String(item.numMinute).padStart(2, '0')}`;
  }

  /** Vista previa en vivo dentro del diálogo de configuración (ej.
   *  "02:00") -- pedido explícito del usuario (2026-10-01): sin esto, los
   *  campos "Hora"/"Minuto" por separado se prestaban a confusión, como
   *  si el job corriera cada N minutos en vez de UNA vez al día a esa
   *  hora exacta. Lee directo del form (no un signal aparte): esta
   *  pantalla no usa `ChangeDetectionStrategy.OnPush`, así que se
   *  re-evalúa solo con cada tecleo. */
  previewSchedule(): string {
    const raw = this.configForm.value;
    const hour = raw.numHour ?? 0;
    const minute = raw.numMinute ?? 0;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
