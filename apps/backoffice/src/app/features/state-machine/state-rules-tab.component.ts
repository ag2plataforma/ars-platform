import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  EntityItem,
  EntityRules,
  RuleItem,
  StateItem,
  StateMachineAdminService,
} from './state-machine-admin.service';

/**
 * Pestaña "Reglas por entidad": se elige una entidad y se ven/editan sus
 * transiciones (origen -[operación]-> destino). Muestra cuántas filas de
 * datos están HOY en el estado de origen de cada regla, para que se vea el
 * impacto antes de tocar o borrar nada. Las validaciones de fondo
 * (ambigüedad, una sola regla inicial, duplicados) las hace el backend.
 */
@Component({
  selector: 'app-state-rules-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    TooltipModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './state-rules-tab.component.html',
})
export class StateRulesTabComponent implements OnChanges {
  @Input() entityId: string | null = null;
  @Input() refreshToken = 0;
  @Output() readonly changed = new EventEmitter<void>();

  private readonly api = inject(StateMachineAdminService);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly entities = signal<EntityItem[]>([]);
  readonly states = signal<StateItem[]>([]);
  readonly selectedEntity = signal<string | null>(null);
  readonly data = signal<EntityRules | null>(null);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  readonly saving = signal(false);
  private editingRule: RuleItem | null = null;

  readonly form = this.fb.nonNullable.group({
    ideStateFrom: ['', Validators.required],
    desOperativeCode: [''],
    ideStateTo: ['', Validators.required],
    indInitialState: [false],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityId'] && this.entityId) {
      this.selectedEntity.set(this.entityId);
    }
    if (changes['refreshToken'] || changes['entityId']) {
      this.loadLists();
    }
  }

  private loadLists(): void {
    this.api.listEntities().subscribe({ next: (rows) => this.entities.set(rows) });
    this.api.listStates().subscribe({ next: (rows) => this.states.set(rows) });
    if (this.selectedEntity()) this.loadRules();
  }

  onEntityChange(ideEntity: string | null): void {
    this.selectedEntity.set(ideEntity);
    this.data.set(null);
    if (ideEntity) this.loadRules();
  }

  loadRules(): void {
    const ide = this.selectedEntity();
    if (!ide) return;
    this.loading.set(true);
    this.api.listRules(ide).subscribe({
      next: (res) => {
        this.data.set(res);
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
    this.editingRule = null;
    this.form.reset({ ideStateFrom: '', desOperativeCode: '', ideStateTo: '', indInitialState: false });
    this.dialogVisible.set(true);
  }

  openEdit(rule: RuleItem): void {
    this.dialogMode.set('edit');
    this.editingRule = rule;
    this.form.reset({
      ideStateFrom: rule.ideStateFrom,
      desOperativeCode: rule.desOperativeCode && rule.desOperativeCode !== '-' ? rule.desOperativeCode : '',
      ideStateTo: rule.ideStateTo,
      indInitialState: rule.indInitialState,
    });
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
    const ide = this.selectedEntity();
    if (!ide) return;
    const raw = this.form.getRawValue();
    const payload = {
      ideStateFrom: raw.ideStateFrom,
      ideStateTo: raw.ideStateTo,
      desOperativeCode: raw.desOperativeCode.trim(),
      indInitialState: raw.indInitialState,
    };
    this.saving.set(true);
    const request =
      this.dialogMode() === 'create'
        ? this.api.createRule({ ideEntity: ide, ...payload })
        : this.api.updateRule(this.editingRule!.ideStateRule, payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeDialog();
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('stateMachine.rules.saved'),
        });
        this.loadRules();
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.showError(err);
      },
    });
  }

  remove(rule: RuleItem): void {
    const rows = rule.rowsInFromState ?? 0;
    this.confirm.confirm({
      header: this.transloco.translate('stateMachine.rules.deleteHeader'),
      message:
        this.transloco.translate('stateMachine.rules.deleteConfirm', {
          from: rule.codStateFrom,
          op: rule.desOperativeCode ?? '-',
          to: rule.codStateTo,
        }) + (rows > 0 ? ' ' + this.transloco.translate('stateMachine.rules.deleteRowsWarning', { n: rows }) : ''),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteRule(rule.ideStateRule, rows > 0).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('stateMachine.rules.deleted'),
            });
            this.loadRules();
            this.changed.emit();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
      },
    });
  }

  entityLabel = (e: EntityItem): string => `${e.codEntity} — ${e.desEntity} (${e.ruleCount})`;
  stateLabel = (s: StateItem): string => `${s.codState} — ${s.desState}`;

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail, life: 8000 });
  }
}
