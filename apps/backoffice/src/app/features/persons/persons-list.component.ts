import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ListPersonsParams, PersonListItem, PersonsService } from '../../core/party/persons.service';

/**
 * Listado de personas (`GET /persons`, plural) -- pantalla "Personas"
 * (CRM-lite, docs/02-roadmap.md item 6): hasta ahora `TPerson` solo se
 * buscaba al vuelo dentro de un flujo puntual (Cotización, Corredores),
 * pedido explícito del usuario para poder listar/ver/editar/crear
 * personas de forma independiente. Mismo patrón `p-table [lazy]="true"`
 * paginado del lado del servidor que `ContractsListComponent`/
 * `QuotesListComponent`.
 *
 * A diferencia de esas dos pantallas, acá no hay un toggle "mostrar
 * todas" -- una persona no "pertenece" a quien la creó (ver doc-comment
 * de `ListPersonsDto` en el backend) -- y el filtro de texto libre (`q`)
 * lleva debounce porque es un input de texto libre, no un checkbox/select
 * que cambia de a uno.
 */
@Component({
  selector: 'app-persons-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    TableModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './persons-list.component.html',
})
export class PersonsListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly persons = inject(PersonsService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly items = signal<PersonListItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);

  /** `indLead`/`indClient` en `false` (por defecto) = sin filtrar por
   *  esa condición -- se traducen a `undefined` en `fetch()`, no se
   *  manda `indLead=false` al backend (ver doc-comment de
   *  `ListPersonsDto.indLead`). */
  filters = this.fb.nonNullable.group({
    q: [''],
    indLead: [false],
    indClient: [false],
  });

  private lastLimit = 20;
  private lastSortField: string | undefined;
  private lastSortOrder: number | undefined;

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.fetch(1, this.lastLimit));
  }

  ngOnInit(): void {
    this.fetch(1, this.lastLimit);
  }

  /** `(onLazyLoad)` de `p-table` -- primera carga, cambio de página, y
   *  orden de columna (sin filtro de columna acá, el filtro de texto
   *  libre ya vive en el formulario de arriba). */
  load(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.lastLimit;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    this.lastSortField = typeof event.sortField === 'string' ? event.sortField : undefined;
    this.lastSortOrder = event.sortOrder ?? undefined;
    this.fetch(page, rows);
  }

  private fetch(page: number, limit: number): void {
    this.lastLimit = limit;
    this.loading.set(true);
    const { q, indLead, indClient } = this.filters.getRawValue();
    const params: ListPersonsParams = {
      page,
      limit,
      q: q.trim() || undefined,
      indLead: indLead || undefined,
      indClient: indClient || undefined,
      sortField: this.lastSortField,
      sortOrder: this.lastSortOrder,
    };
    this.persons.list(params).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const detail =
          (err.error && typeof err.error === 'object' && 'message' in err.error
            ? String((err.error as { message: unknown }).message)
            : null) ?? this.transloco.translate<string>('common.unexpectedError');
        this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
      },
    });
  }

  nombreCompleto(item: PersonListItem): string {
    return [item.DesFirstName, item.DesLastName1].filter(Boolean).join(' ');
  }

  abrir(item: PersonListItem): void {
    this.router.navigate(['/personas', item.IdePerson]);
  }

  nueva(): void {
    this.router.navigate(['/personas/nueva']);
  }
}
