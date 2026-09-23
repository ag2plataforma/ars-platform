import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { ContractListItem, ContractsService, ListContractsParams } from './contracts.service';

const PRODUCTS_PATH = '/product-rating/products';

/**
 * Listado de contratos (`GET /contracts`, plural) -- landing de
 * "Contratos" en el sidebar (`/contratos`). Columnas y comportamiento
 * (orden + filtro por columna + pie "Mostrando X al Y de Z") pedidos
 * explícitamente por el usuario el 23/09/2026, calcados del listado de
 * pólizas del backoffice viejo (ver docs/02-roadmap.md).
 *
 * Sigue siendo paginado del lado del servidor (`p-table [lazy]="true"`,
 * igual que `QuotesListComponent`) -- a diferencia de las tablas del
 * detalle de un contrato puntual (que sí pueden ordenar/filtrar 100% en
 * el cliente porque cargan todo de una vez), acá el orden y el único
 * filtro de columna (`Número de contrato`) viajan al backend
 * (`ListContractsParams.sortField`/`sortOrder`/`filterNumContract`),
 * para no traer todos los contratos a memoria solo para ordenarlos.
 */
@Component({
  selector: 'app-contracts-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './contracts-list.component.html',
})
export class ContractsListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly contracts = inject(ContractsService);
  private readonly catalogService = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly items = signal<ContractListItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly products = signal<CatalogRow[]>([]);

  /** `codProduct: ''` = "Todos los productos"; `showAll: false` (por
   *  defecto) = solo los contratos generados por el usuario logueado. */
  filters = this.fb.nonNullable.group({
    codProduct: [''],
    showAll: [false],
  });

  private lastLimit = 20;
  private lastSortField: string | undefined;
  private lastSortOrder: number | undefined;
  private lastNumContractFilter: string | undefined;

  constructor() {
    this.filters.valueChanges.subscribe(() => this.fetch(1, this.lastLimit));
  }

  ngOnInit(): void {
    this.catalogService.list(PRODUCTS_PATH).subscribe({ next: (rows) => this.products.set(rows) });
  }

  /** `(onLazyLoad)` de `p-table` -- primera carga, cambio de página, y
   *  también orden/filtro de columna (PrimeNG reemite este mismo evento
   *  con `sortField`/`sortOrder`/`filters` actualizados en tablas
   *  `[lazy]="true"`, sin necesidad de un handler separado). */
  load(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.lastLimit;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    this.lastSortField = typeof event.sortField === 'string' ? event.sortField : undefined;
    this.lastSortOrder = event.sortOrder ?? undefined;
    const numContractFilter = event.filters?.['numContract'];
    const filterValue = Array.isArray(numContractFilter) ? numContractFilter[0]?.value : numContractFilter?.value;
    this.lastNumContractFilter = typeof filterValue === 'string' && filterValue.length > 0 ? filterValue : undefined;
    this.fetch(page, rows);
  }

  private fetch(page: number, limit: number): void {
    this.lastLimit = limit;
    this.loading.set(true);
    const { codProduct, showAll } = this.filters.getRawValue();
    const params: ListContractsParams = {
      page,
      limit,
      all: showAll,
      codProduct: codProduct || undefined,
      sortField: this.lastSortField,
      sortOrder: this.lastSortOrder,
      filterNumContract: this.lastNumContractFilter,
    };
    this.contracts.list(params).subscribe({
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

  /** Color del `p-tag` de estado -- los códigos de prueba de hoy (ver
   *  docs/02-roadmap.md, misma máquina de estados `SEED_` simplificada
   *  que `TQuote`) mapeados a algo razonable; cualquier otro código cae
   *  en el `default` neutro. */
  stateSeverity(codState: string): 'info' | 'warn' | 'success' | 'secondary' {
    switch (codState) {
      case 'ACTIVO':
        return 'success';
      case 'SEED_ANULADO':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  abrir(item: ContractListItem): void {
    this.router.navigate(['/contratos', item.ideContract]);
  }
}
