import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import {
  PersonDetail,
  PersonRelated,
  PersonsService,
  RelatedContract,
  RelatedQuote,
  UpdatePersonPayload,
} from '../../core/party/persons.service';

/**
 * Detalle de una persona (`GET /persons/:id` + `GET /persons/:id/related`)
 * -- pantalla "Personas" (CRM-lite, docs/02-roadmap.md item 6), vínculo
 * explícitamente pedido por el usuario ("sí, mostrar cotizaciones y
 * contratos") al definir el alcance.
 *
 * La tabla de cotizaciones filtra por defecto las ya contratadas
 * (`quoteStateFilter() === 'pending'`) -- pedido explícito del usuario
 * (2026-10-02): una cotización contratada ya se ve como contrato en la
 * tabla de abajo, mostrarla también acá es redundante. Filtro en
 * memoria (`filteredQuotes`, no un nuevo parámetro de
 * `findRelated`) porque la lista de cotizaciones de una sola persona es
 * chica -- no amerita ida y vuelta al backend por cambiar el filtro.
 *
 * Se editan todos los datos de `TPerson` que acepta `UpdatePersonPayload`/
 * `PersonsService.update` (`PATCH /persons/:id`): nombre, documento (tipo y
 * número), email, fecha y lugar de nacimiento, sexo, estado civil,
 * profesión, actividad económica y país de nacimiento (la localidad de
 * nacimiento, jerárquica, queda fuera). Dirección/teléfono se muestran de solo lectura
 * -- su edición ya vive en el diálogo "Cambiar datos" de Tomador/Titular
 * (`ContractsService.changePersonData`, dentro del contrato, para que
 * quede atómico con una operación de trazabilidad); no se duplica ese
 * flujo acá.
 */
@Component({
  selector: 'app-person-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule, TableModule, TagModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  templateUrl: './person-detail.component.html',
})
export class PersonDetailComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly persons = inject(PersonsService);
  private readonly catalogService = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  private idePerson!: string;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly person = signal<PersonDetail | null>(null);
  readonly related = signal<PersonRelated | null>(null);

  /** Códigos de `TQuote.SState` que ya pasaron a contrato -- ver
   *  doc-comment de la clase. */
  private static readonly CONTRACTED_QUOTE_STATES = new Set(['CONTRATADO']);

  readonly quoteStateFilter = signal<'pending' | 'contracted' | 'all'>('pending');

  readonly filteredQuotes = computed(() => {
    const quotes = this.related()?.quotes ?? [];
    const filter = this.quoteStateFilter();
    if (filter === 'all') return quotes;
    return quotes.filter((q) => PersonDetailComponent.CONTRACTED_QUOTE_STATES.has(q.codState) === (filter === 'contracted'));
  });

  form = this.fb.nonNullable.group({
    desFirstName: ['', Validators.required],
    desMiddleName: [''],
    desLastName1: ['', Validators.required],
    desLastName2: [''],
    desEmail: ['', [Validators.required, Validators.email]],
    ideIdentificationType: [''],
    numIdentification: [''],
    tstBirthdate: [''],
    ideGender: [''],
    ideMaritalStatus: [''],
    ideProfession: [''],
    ideBusinessActivity: [''],
    desBirthPlace: [''],
    ideCountryBirth: [''],
  });

  /** Catalogos de los desplegables de datos demograficos. */
  readonly identificationTypes = signal<CatalogRow[]>([]);
  readonly genders = signal<CatalogRow[]>([]);
  readonly maritalStatuses = signal<CatalogRow[]>([]);
  readonly professions = signal<CatalogRow[]>([]);
  readonly businessActivities = signal<CatalogRow[]>([]);
  readonly countries = signal<CatalogRow[]>([]);

  constructor() {
    this.catalogService.list('/reference-data/identification-types').subscribe({ next: (r) => this.identificationTypes.set(r) });
    this.catalogService.list('/reference-data/genders').subscribe({ next: (r) => this.genders.set(r) });
    this.catalogService.list('/reference-data/marital-statuses').subscribe({ next: (r) => this.maritalStatuses.set(r) });
    this.catalogService.list('/reference-data/professions').subscribe({ next: (r) => this.professions.set(r) });
    this.catalogService.list('/reference-data/business-activities').subscribe({ next: (r) => this.businessActivities.set(r) });
    this.catalogService.list('/reference-data/countries').subscribe({ next: (r) => this.countries.set(r) });
  }

  ngOnInit(): void {
    this.idePerson = this.route.snapshot.paramMap.get('id') ?? '';
    this.cargar();
  }

  private cargar(): void {
    this.loading.set(true);
    forkJoin({
      person: this.persons.findOne(this.idePerson),
      related: this.persons.findRelated(this.idePerson),
    }).subscribe({
      next: ({ person, related }) => {
        this.person.set(person);
        this.related.set(related);
        this.form.patchValue({
          desFirstName: person.DesFirstName,
          desMiddleName: person.DesMiddleName ?? '',
          desLastName1: person.DesLastName1 ?? '',
          desLastName2: person.DesLastName2 ?? '',
          desEmail: person.DesEmail,
          ideIdentificationType: person.IdeIdentificationType ?? '',
          numIdentification: person.NumIdentification ?? '',
          tstBirthdate: person.TstBirthdate ? String(person.TstBirthdate).slice(0, 10) : '',
          ideGender: person.IdeGender ?? '',
          ideMaritalStatus: person.IdeMaritalStatus ?? '',
          ideProfession: person.IdeProfession ?? '',
          ideBusinessActivity: person.IdeBusinessActivity ?? '',
          desBirthPlace: person.DesBirthPlace ?? '',
          ideCountryBirth: person.IdeCountryBirth ?? '',
        });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('common.unexpectedError'),
        });
      },
    });
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: UpdatePersonPayload = {
      desFirstName: raw.desFirstName,
      desMiddleName: raw.desMiddleName || undefined,
      desLastName1: raw.desLastName1 || undefined,
      desLastName2: raw.desLastName2 || undefined,
      desEmail: raw.desEmail,
      ideIdentificationType: raw.ideIdentificationType || undefined,
      numIdentification: raw.numIdentification || undefined,
      tstBirthdate: raw.tstBirthdate || undefined,
      ideGender: raw.ideGender || undefined,
      ideMaritalStatus: raw.ideMaritalStatus || undefined,
      ideProfession: raw.ideProfession || undefined,
      ideBusinessActivity: raw.ideBusinessActivity || undefined,
      desBirthPlace: raw.desBirthPlace || undefined,
      ideCountryBirth: raw.ideCountryBirth || undefined,
    };
    this.saving.set(true);
    this.persons.update(this.idePerson, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('personDetail.savedMessage'),
        });
        this.cargar();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const detail =
          (err.error && typeof err.error === 'object' && 'message' in err.error
            ? String((err.error as { message: unknown }).message)
            : null) ?? this.transloco.translate<string>('common.unexpectedError');
        this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
      },
    });
  }

  stateSeverity(codState: string): 'info' | 'warn' | 'success' | 'secondary' {
    switch (codState) {
      case 'ACTIVO':
      case 'CONTRATADO':
        return 'success';
      case 'ACEPTADO':
        return 'warn';
      case 'BORRADOR':
        return 'info';
      default:
        return 'secondary';
    }
  }

  abrirCotizacion(row: RelatedQuote): void {
    this.router.navigate(['/cotizacion', row.ideQuote]);
  }

  abrirContrato(row: RelatedContract): void {
    this.router.navigate(['/contratos', row.ideContract]);
  }

  /** Ruta a la que volver si se llego desde otra pantalla (ej. el contrato); solo rutas internas. */
  private readonly returnTo = (() => {
    const value = this.route.snapshot.queryParamMap.get('volverA');
    return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
  })();
  readonly cameFromElsewhere = this.returnTo !== null;

  volver(): void {
    if (this.returnTo) {
      const query = this.route.snapshot.queryParamMap;
      const queryParams: Record<string, string> = {};
      for (const key of ['tab', 'certificado']) {
        const value = query.get(key);
        if (value) queryParams[key] = value;
      }
      this.router.navigate([this.returnTo], { queryParams });
      return;
    }
    this.router.navigate(['/personas']);
  }
}
