import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ListUsersParams, RoleOption, UserRow, UsersService } from './users.service';

/** '(todos)' -- mismo comodín NULL que otras pantallas con filtro opcional. */
const ANY_ROLE = '__ANY__';

/**
 * Pantalla de administración de usuarios (`TUser` via `iam-service`,
 * `GET/POST/PATCH /iam/users`) -- no existía frontend para este CRUD
 * pese a que el backend ya lo soporta completo desde Fase 4. Se
 * construye ahora junto con el dashboard de KPIs por rol (Fase 5),
 * porque sin esta pantalla no hay forma de asignar los roles nuevos
 * `SALES`/`PORTFOLIO` a usuarios reales para probarlo.
 *
 * Paginado del lado del servidor (`p-table [lazy]="true"`), mismo
 * criterio `page`/`limit` que `QuotesListComponent`. El diálogo de
 * alta/edición es deliberadamente a medida (no `CatalogService`
 * genérico) porque la forma de la respuesta paginada
 * (`{items,total,page,limit}`) y el campo `password` (solo en alta)
 * no encajan con ese patrón genérico.
 */
@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly usersService = inject(UsersService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly ANY_ROLE = ANY_ROLE;

  readonly items = signal<UserRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly roles = signal<RoleOption[]>([]);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: UserRow | null = null;

  roleFilter = this.fb.nonNullable.group({
    codRol: [ANY_ROLE],
  });

  form = this.newForm();

  private lastLimit = 20;

  constructor() {
    this.roleFilter.valueChanges.subscribe(() => this.fetch(1, this.lastLimit));
  }

  ngOnInit(): void {
    this.usersService.listRoles().subscribe({ next: (rows) => this.roles.set(rows) });
  }

  private newForm() {
    return this.fb.nonNullable.group({
      codUser: ['', Validators.required],
      userName: ['', [Validators.required, Validators.email]],
      password: [''],
      codRol: ['', Validators.required],
    });
  }

  /** `(onLazyLoad)` de `p-table` -- primera página al montar, y cada
   *  cambio de página después (sin sorting/filtros de columna, tabla
   *  chica de uso administrativo). */
  load(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.lastLimit;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    this.fetch(page, rows);
  }

  private fetch(page: number, limit: number): void {
    this.lastLimit = limit;
    this.loading.set(true);
    const { codRol } = this.roleFilter.getRawValue();
    const params: ListUsersParams = {
      page,
      limit,
      codRol: codRol === ANY_ROLE ? undefined : codRol,
    };
    this.usersService.list(params).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.showError(err);
      },
    });
  }

  isActive(row: UserRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.form = this.newForm();
    this.form.controls.password.addValidators([Validators.required, Validators.minLength(8)]);
    this.form.controls.password.updateValueAndValidity();
    this.dialogVisible.set(true);
  }

  openEdit(row: UserRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.form = this.newForm();
    this.form.controls.codUser.disable();
    this.form.patchValue({
      codUser: row.CodUser,
      userName: row.UserName,
      codRol: row.TRol?.CodRol ?? '',
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
    const raw = this.form.getRawValue();
    const isCreate = this.dialogMode() === 'create';

    if (isCreate) {
      this.usersService
        .create({
          codUser: raw.codUser,
          userName: raw.userName,
          password: raw.password,
          codRol: raw.codRol,
        })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('users.createdDetail'),
            });
            this.closeDialog();
            this.fetch(1, this.lastLimit);
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const ideUser = this.editingRow!.IdeUser;
      this.usersService.update(ideUser, { userName: raw.userName, codRol: raw.codRol }).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('users.updatedDetail'),
          });
          this.closeDialog();
          this.fetch(1, this.lastLimit);
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  toggleState(row: UserRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: row.CodUser,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.usersService.setState(row.IdeUser, nextState).subscribe({
          next: () => this.fetch(1, this.lastLimit),
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
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
