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
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { PersonsService } from '../../core/party/persons.service';
import { ListUsersParams, RoleOption, UserRow, UsersService } from './users.service';

const DISTRIBUTION_CHANNELS_PATH = '/party/distribution-channels';
/** Valor del desplegable de nodo para "sin nodo comercial". */
const NO_CHANNEL = '__NONE__';

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
  private readonly catalogService = inject(CatalogService);
  private readonly persons = inject(PersonsService);

  readonly ANY_ROLE = ANY_ROLE;
  readonly NO_CHANNEL = NO_CHANNEL;
  readonly languages = [
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'English' },
  ];

  /** Nodos comerciales (`SDistributionChannel`) para asignar a un usuario. */
  readonly channels = signal<CatalogRow[]>([]);
  /** Persona vinculada al usuario (`UserData.idePerson`), si hay una. */
  readonly linkedPerson = signal<{ idePerson: string; name: string } | null>(null);
  readonly personSearchControl = this.fb.nonNullable.control('');
  readonly personSearching = signal(false);
  readonly personNotFound = signal(false);

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
    this.catalogService.list(DISTRIBUTION_CHANNELS_PATH).subscribe({ next: (rows) => this.channels.set(rows) });
  }

  /** Nombre del nodo comercial de un usuario (para la tabla). */
  channelNameOf(row: UserRow): string | null {
    const ide = (row.UserData as { ideDistributionChannel?: string } | null | undefined)?.ideDistributionChannel;
    if (!ide) return null;
    const channel = this.channels().find((c) => c['IdeDistributionChannel'] === ide);
    return channel ? String(channel['DesDistributionChannel']) : ide;
  }

  private newForm() {
    return this.fb.nonNullable.group({
      codUser: ['', Validators.required],
      userName: ['', [Validators.required, Validators.email]],
      password: [''],
      codRol: ['', Validators.required],
      ideDistributionChannel: [NO_CHANNEL],
      lang: ['es'],
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
    this.resetPerson(null);
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
      ideDistributionChannel: String(row.UserData?.['ideDistributionChannel'] ?? '') || NO_CHANNEL,
      lang: String(row.UserData?.['lang'] ?? '') || 'es',
    });
    this.resetPerson(String(row.UserData?.['idePerson'] ?? '') || null);
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
    const userData = this.buildUserData(raw);

    if (isCreate) {
      this.usersService
        .create({
          codUser: raw.codUser,
          userName: raw.userName,
          password: raw.password,
          codRol: raw.codRol,
          userData,
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
      this.usersService.update(ideUser, { userName: raw.userName, codRol: raw.codRol, userData }).subscribe({
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

  /** Parte de las propiedades actuales del usuario (se conservan las que esta pantalla no gestiona) y aplica las del formulario. */
  private buildUserData(raw: { ideDistributionChannel: string; lang: string }): Record<string, unknown> {
    const data: Record<string, unknown> = { ...(this.editingRow?.UserData ?? {}) };
    const setOrDelete = (key: string, value: string | null | undefined) => {
      if (value) data[key] = value;
      else delete data[key];
    };
    setOrDelete('ideDistributionChannel', raw.ideDistributionChannel === NO_CHANNEL ? null : raw.ideDistributionChannel);
    setOrDelete('idePerson', this.linkedPerson()?.idePerson);
    setOrDelete('lang', raw.lang);
    return data;
  }

  /** Carga (o limpia) la persona vinculada que se muestra en el formulario. */
  private resetPerson(idePerson: string | null): void {
    this.personSearchControl.setValue('');
    this.personNotFound.set(false);
    this.linkedPerson.set(null);
    if (!idePerson) return;
    this.linkedPerson.set({ idePerson, name: idePerson });
    this.persons.findOne(idePerson).subscribe({
      next: (p) => this.linkedPerson.set({ idePerson, name: this.personName(p) }),
      error: () => undefined,
    });
  }

  private personName(p: { DesFirstName: string; DesMiddleName: string | null; DesLastName1: string | null; DesLastName2: string | null; NumIdentification: string | null }): string {
    const name = [p.DesFirstName, p.DesMiddleName, p.DesLastName1, p.DesLastName2].filter(Boolean).join(' ');
    return p.NumIdentification ? `${name} (${p.NumIdentification})` : name;
  }

  /** Busca la persona a vincular por documento o email. */
  searchPerson(): void {
    const text = this.personSearchControl.value.trim();
    if (!text) return;
    this.personSearching.set(true);
    this.personNotFound.set(false);
    const criteria = text.includes('@') ? { email: text } : { numIdentification: text };
    this.persons.lookup(criteria).subscribe({
      next: (p) => {
        this.personSearching.set(false);
        this.linkedPerson.set({ idePerson: p.IdePerson, name: this.personName(p) });
        this.personSearchControl.setValue('');
      },
      error: () => {
        this.personSearching.set(false);
        this.personNotFound.set(true);
      },
    });
  }

  clearPerson(): void {
    this.linkedPerson.set(null);
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
