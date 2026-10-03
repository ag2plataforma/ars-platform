import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
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
 * Edición acotada a los campos que acepta `UpdatePersonPayload`/
 * `PersonsService.update` (`PATCH /persons/:id`) -- datos demográficos
 * con catálogo propio (género, país/localidad, profesión, actividad
 * económica, estado civil, tipo de documento) NO se editan acá todavía
 * (ver doc-comment de `UpdatePersonPayload`: esos catálogos no tienen
 * selector construido). Dirección/teléfono se muestran de solo lectura
 * -- su edición ya vive en el diálogo "Cambiar datos" de Tomador/Titular
 * (`ContractsService.changePersonData`, dentro del contrato, para que
 * quede atómico con una operación de trazabilidad); no se duplica ese
 * flujo acá.
 */
@Component({
  selector: 'app-person-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, TableModule, TagModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  templateUrl: './person-detail.component.html',
})
export class PersonDetailComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly persons = inject(PersonsService);
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
    numIdentification: [''],
  });

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
          numIdentification: person.NumIdentification ?? '',
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
      numIdentification: raw.numIdentification || undefined,
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

  volver(): void {
    this.router.navigate(['/personas']);
  }
}
