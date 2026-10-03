import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { StateItem, StateMachineAdminService } from './state-machine-admin.service';

/** Pestaña "Estados" (`SState`). El código NO se edita (el código de negocio
 *  busca estados por código); borrar exige que ninguna regla ni fila de
 *  datos lo use -- lo verifica el backend. */
@Component({
  selector: 'app-states-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    TableModule,
    ToastModule,
    TooltipModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './states-tab.component.html',
})
export class StatesTabComponent {
  @Output() readonly changed = new EventEmitter<void>();

  private readonly api = inject(StateMachineAdminService);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<StateItem[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  readonly saving = signal(false);
  private editing: StateItem | null = null;

  form = this.buildForm('create');

  constructor() {
    this.load();
  }

  private buildForm(mode: 'create' | 'edit', row?: StateItem) {
    return this.fb.nonNullable.group({
      cod:
        mode === 'create'
          ? ['', [Validators.required, Validators.pattern(/^[A-Z0-9_]+$/), Validators.maxLength(30)]]
          : [{ value: row?.codState ?? '', disabled: true }],
      des: [row?.desState ?? '', [Validators.required, Validators.maxLength(200)]],
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.listStates().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.showError(err);
      },
    });
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editing = null;
    this.form = this.buildForm('create');
    this.dialogVisible.set(true);
  }

  openEdit(row: StateItem): void {
    this.dialogMode.set('edit');
    this.editing = row;
    this.form = this.buildForm('edit', row);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    const request =
      this.dialogMode() === 'create'
        ? this.api.createState({ codState: raw.cod.trim(), desState: raw.des.trim() })
        : this.api.updateState(this.editing!.ideState, { desState: raw.des.trim() });
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeDialog();
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('stateMachine.states.saved'),
        });
        this.load();
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.showError(err);
      },
    });
  }

  remove(row: StateItem): void {
    this.confirm.confirm({
      header: this.transloco.translate('stateMachine.states.deleteHeader'),
      message: this.transloco.translate('stateMachine.states.deleteConfirm', { item: row.codState }),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteState(row.ideState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('stateMachine.states.deleted'),
            });
            this.load();
            this.changed.emit();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
      },
    });
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail, life: 8000 });
  }
}
