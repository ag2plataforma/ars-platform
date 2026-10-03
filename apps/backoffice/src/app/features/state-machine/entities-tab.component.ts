import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { EntityItem, StateMachineAdminService } from './state-machine-admin.service';

/** Pestaña "Entidades" (`SEntity`): lo que tiene máquina de estados. El
 *  código es el nombre que usa el código de negocio (`getNextState('TContract', ...)`),
 *  no se edita. Borrar solo si no tiene reglas ni referencias (backend). */
@Component({
  selector: 'app-entities-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    TableModule,
    TagModule,
    ToastModule,
    TooltipModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './entities-tab.component.html',
})
export class EntitiesTabComponent implements OnChanges {
  @Input() refreshToken = 0;
  @Output() readonly changed = new EventEmitter<void>();
  @Output() readonly openRules = new EventEmitter<string>();

  private readonly api = inject(StateMachineAdminService);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<EntityItem[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  readonly saving = signal(false);
  private editing: EntityItem | null = null;

  form = this.buildForm('create');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshToken']) this.load();
  }

  private buildForm(mode: 'create' | 'edit', row?: EntityItem) {
    return this.fb.nonNullable.group({
      cod:
        mode === 'create'
          ? ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_]+$/), Validators.maxLength(30)]]
          : [{ value: row?.codEntity ?? '', disabled: true }],
      des: [row?.desEntity ?? '', [Validators.required, Validators.maxLength(200)]],
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.listEntities().subscribe({
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

  openEdit(row: EntityItem): void {
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
        ? this.api.createEntity({ codEntity: raw.cod.trim(), desEntity: raw.des.trim() })
        : this.api.updateEntity(this.editing!.ideEntity, { desEntity: raw.des.trim() });
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeDialog();
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('stateMachine.entities.saved'),
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

  remove(row: EntityItem): void {
    this.confirm.confirm({
      header: this.transloco.translate('stateMachine.entities.deleteHeader'),
      message: this.transloco.translate('stateMachine.entities.deleteConfirm', { item: row.codEntity }),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteEntity(row.ideEntity).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('stateMachine.entities.deleted'),
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
