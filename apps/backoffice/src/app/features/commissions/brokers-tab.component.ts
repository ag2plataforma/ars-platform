import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { Person, PersonsService } from '../../core/party/persons.service';

const PATH = '/party/brokers';
const BROKER_TYPES_PATH = '/party/broker-types';

/**
 * `TBroker` -- deliberadamente afuera de la pantalla de Comisiones
 * cuando se construyeron las otras 4 pestañas (23/09/2026, ver
 * `docs/02-roadmap.md`) porque necesitaba un selector de `TPerson`, que
 * hasta ahora no existía fuera del paso "Personas" de Cotización. Se
 * resuelve acá reutilizando `PersonsService` (movido a `core/party`
 * justo para esto) con el mismo flujo de esa pantalla: buscar una
 * persona existente por número de identificación (`GET
 * /persons/lookup`) o, si no existe, crear una nueva -- en ambos casos
 * se guarda como `selectedPerson`, y recién al guardar el corredor se
 * manda `idePerson` en el payload (a diferencia de Cotización, acá no
 * hay una asociación aparte que confirmar contra el backend antes de
 * tiempo).
 *
 * `SBrokerType` (tipo de corredor) tampoco tenía ningún endpoint de
 * listado -- se agregó `BrokerTypesController`/`BrokerTypesService` en
 * `party-service` (mismo patrón que `SChannelType`) solo para poder
 * armar este selector.
 */
@Component({
  selector: 'app-brokers-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './brokers-tab.component.html',
})
export class BrokersTabComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly personsService = inject(PersonsService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly brokerTypes = signal<CatalogRow[]>([]);
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  // --- Selector de persona (buscar existente o crear una nueva) ---
  readonly selectedPerson = signal<Person | null>(null);
  readonly personSearchControl = this.fb.control('');
  readonly personSearching = signal(false);
  readonly personFound = signal<Person | null>(null);
  readonly personNotFound = signal(false);
  readonly creatingPerson = signal(false);
  readonly nameSearchControl = this.fb.control('');
  readonly nameSearching = signal(false);
  readonly nameSearchResults = signal<Person[]>([]);
  readonly nameSearchedEmpty = signal(false);
  readonly createPersonForm = this.fb.nonNullable.group({
    desFirstName: ['', Validators.required],
    desLastName1: [''],
    desEmail: ['', [Validators.required, Validators.email]],
    numIdentification: [''],
  });

  form = this.fb.nonNullable.group({
    cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
    des: ['', Validators.required],
    codBrokerType: ['', Validators.required],
  });

  constructor() {
    this.loadBrokerTypes();
    this.load();
  }

  private loadBrokerTypes(): void {
    this.catalogService.list(BROKER_TYPES_PATH).subscribe({
      next: (rows) => this.brokerTypes.set(rows),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.brokers.loadTypesErrorDetail'),
        }),
    });
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(PATH).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('commissions.brokers.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  brokerTypeName(row: CatalogRow): string {
    const brokerType = row['SBrokerType'] as { DesBrokerType?: string } | undefined;
    return brokerType?.DesBrokerType ?? this.transloco.translate('commissions.noBrokerTypeFallback');
  }

  personName(row: CatalogRow): string {
    const person = row['TPerson'] as Person | undefined;
    if (!person) return this.transloco.translate('commissions.noPersonFallback');
    return [person.DesFirstName, person.DesLastName1].filter(Boolean).join(' ');
  }

  private resetPersonSelection(): void {
    this.selectedPerson.set(null);
    this.personFound.set(null);
    this.personNotFound.set(false);
    this.creatingPerson.set(false);
    this.personSearchControl.setValue('');
    this.createPersonForm.reset();
    this.nameSearchControl.setValue('');
    this.nameSearchResults.set([]);
    this.nameSearchedEmpty.set(false);
  }

  searchPerson(): void {
    const numIdentification = (this.personSearchControl.value ?? '').trim();
    if (!numIdentification) return;
    this.personSearching.set(true);
    this.personNotFound.set(false);
    this.personFound.set(null);
    this.personsService.lookup({ numIdentification }).subscribe({
      next: (person) => {
        this.personSearching.set(false);
        this.personFound.set(person);
      },
      error: () => {
        this.personSearching.set(false);
        this.personNotFound.set(true);
        this.creatingPerson.set(true);
        this.createPersonForm.patchValue({ numIdentification });
      },
    });
  }

  selectFoundPerson(): void {
    const person = this.personFound();
    if (!person) return;
    this.pickPerson(person);
  }

  /** Búsqueda por nombre (`PersonsService.searchByName`), complementaria
   *  a la búsqueda exacta por DNI de arriba -- pedido explícito del
   *  usuario al probar esta pantalla: no siempre se tiene a mano el
   *  número de identificación de la persona. Puede devolver varias
   *  personas con nombres parecidos, así que se listan todas para elegir
   *  (a diferencia de la búsqueda por DNI, que espera un único
   *  resultado). */
  searchByName(): void {
    const q = (this.nameSearchControl.value ?? '').trim();
    if (q.length < 2) return;
    this.nameSearching.set(true);
    this.nameSearchedEmpty.set(false);
    this.nameSearchResults.set([]);
    this.personsService.searchByName(q).subscribe({
      next: (people) => {
        this.nameSearching.set(false);
        this.nameSearchResults.set(people);
        this.nameSearchedEmpty.set(people.length === 0);
      },
      error: (err: HttpErrorResponse) => {
        this.nameSearching.set(false);
        this.showError(err);
      },
    });
  }

  pickPerson(person: Person): void {
    this.selectedPerson.set(person);
    this.personFound.set(null);
    this.personNotFound.set(false);
    this.personSearchControl.setValue('');
    this.nameSearchControl.setValue('');
    this.nameSearchResults.set([]);
    this.nameSearchedEmpty.set(false);
  }

  createPerson(): void {
    if (this.createPersonForm.invalid) {
      this.createPersonForm.markAllAsTouched();
      return;
    }
    const raw = this.createPersonForm.getRawValue();
    this.personsService
      .create({
        desFirstName: raw.desFirstName,
        desLastName1: raw.desLastName1 || undefined,
        desEmail: raw.desEmail,
        numIdentification: raw.numIdentification || undefined,
      })
      .subscribe({
        next: (person) => {
          this.selectedPerson.set(person);
          this.personNotFound.set(false);
          this.creatingPerson.set(false);
          this.createPersonForm.reset();
          this.personSearchControl.setValue('');
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
  }

  changePerson(): void {
    this.resetPersonSelection();
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.loadBrokerTypes();
    this.resetPersonSelection();
    this.form = this.fb.nonNullable.group({
      cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      des: ['', Validators.required],
      codBrokerType: ['', Validators.required],
    });
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.loadBrokerTypes();
    this.resetPersonSelection();
    const brokerType = row['SBrokerType'] as { CodBrokerType?: string } | undefined;
    const person = row['TPerson'] as Person | undefined;
    if (person) {
      this.selectedPerson.set(person);
    }
    this.form = this.fb.nonNullable.group({
      cod: [{ value: String(row['CodBroker'] ?? ''), disabled: true }],
      des: [String(row['DesBroker'] ?? ''), Validators.required],
      codBrokerType: [brokerType?.CodBrokerType ?? '', Validators.required],
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
    const person = this.selectedPerson();
    if (!person) {
      this.messages.add({
        severity: 'warn',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('commissions.brokers.missingPersonDetail'),
      });
      return;
    }
    const raw = this.form.getRawValue();

    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, { codBroker: raw.cod, desBroker: raw.des, codBrokerType: raw.codBrokerType, idePerson: person.IdePerson })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('catalogs.createdDetail', { item: raw.des }),
            });
            this.closeDialog();
            this.load();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeBroker']);
      this.catalogService
        .update(PATH, id, { desBroker: raw.des, codBrokerType: raw.codBrokerType, idePerson: person.IdePerson })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('catalogs.updatedDetail', { item: raw.des }),
            });
            this.closeDialog();
            this.load();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    }
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    const desc = String(row['DesBroker'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeBroker']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('catalogs.toggledDetail', {
                item: desc,
                state: this.transloco.translate(nextState === 'ACTIVO' ? 'common.active' : 'common.inactive').toLowerCase(),
              }),
            });
            this.load();
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
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
