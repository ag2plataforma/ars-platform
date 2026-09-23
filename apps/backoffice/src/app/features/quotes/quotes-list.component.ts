import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { ListQuotesParams, QuoteListItem, QuotingService } from './quoting.service';

const PRODUCTS_PATH = '/product-rating/products';

/**
 * Listado de cotizaciones (`GET /quotes`, plural) -- landing de
 * "Cotización" en el sidebar (`/cotizacion`), pedido explícito del
 * usuario al probar la Etapa 1 del wizard (`QuotesComponent`, que ahora
 * vive en `/cotizacion/nueva` para una nueva y `/cotizacion/:id` para
 * retomar una existente -- ver `app.routes.ts` y docs/02-roadmap.md).
 *
 * Paginado del lado del servidor (`p-table [lazy]="true"`, mismo
 * criterio `page`/`limit` que ya usa `iam-service`/`ListUsersDto`) --
 * decisión explícita del usuario: por defecto solo las cotizaciones
 * creadas por el usuario logueado (`UsrCreation`), con un toggle para
 * ver todas.
 *
 * Filtro por producto incluido (reutiliza el mismo catálogo que ya
 * carga `QuotesComponent`); filtro por estado/rango de fechas quedan
 * soportados en el backend (`ListQuotesDto`) pero sin UI todavía -- los
 * estados hoy son códigos de prueba (`SEED_BORRADOR`/`ACEPTADO`/
 * `SEED_CONTRATADO`, ver docs/02-roadmap.md) y no hay ningún
 * `p-datepicker`/`p-calendar` usado en el resto del frontend todavía
 * como para introducir ese patrón acá sin más contexto/decisión.
 */
@Component({
  selector: 'app-quotes-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './quotes-list.component.html',
})
export class QuotesListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly quoting = inject(QuotingService);
  private readonly catalogService = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly items = signal<QuoteListItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly products = signal<CatalogRow[]>([]);

  /** `codProduct: ''` = "Todos los productos"; `showAll: false` (por
   *  defecto) = solo las cotizaciones del usuario logueado. */
  filters = this.fb.nonNullable.group({
    codProduct: [''],
    showAll: [false],
  });

  private lastLimit = 20;
  private lastSortField: string | undefined;
  private lastSortOrder: number | undefined;
  private lastNumQuoteFilter: string | undefined;

  constructor() {
    // Cualquier cambio de filtro reinicia a la página 1 -- no tiene
    // sentido mantener la página actual si el conjunto de resultados
    // cambia por completo.
    this.filters.valueChanges.subscribe(() => this.fetch(1, this.lastLimit));
  }

  ngOnInit(): void {
    this.catalogService.list(PRODUCTS_PATH).subscribe({ next: (rows) => this.products.set(rows) });
  }

  /** `(onLazyLoad)` de `p-table` -- primera página al montar, y cada
   *  cambio de página/tamaño de página después. */
  load(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.lastLimit;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    this.lastSortField = typeof event.sortField === 'string' ? event.sortField : undefined;
    this.lastSortOrder = event.sortOrder ?? undefined;
    const numQuoteFilter = event.filters?.['numQuote'];
    const filterValue = Array.isArray(numQuoteFilter) ? numQuoteFilter[0]?.value : numQuoteFilter?.value;
    this.lastNumQuoteFilter = typeof filterValue === 'string' && filterValue.length > 0 ? filterValue : undefined;
    this.fetch(page, rows);
  }

  private fetch(page: number, limit: number): void {
    this.lastLimit = limit;
    this.loading.set(true);
    const { codProduct, showAll } = this.filters.getRawValue();
    const params: ListQuotesParams = {
      page,
      limit,
      all: showAll,
      codProduct: codProduct || undefined,
      sortField: this.lastSortField,
      sortOrder: this.lastSortOrder,
      filterNumQuote: this.lastNumQuoteFilter,
    };
    this.quoting.list(params).subscribe({
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
   *  docs/02-roadmap.md) mapeados a algo razonable; cualquier otro
   *  código (ej. si se migran los estados reales del legado más
   *  adelante) cae en el `default` neutro, sin romper. */
  stateSeverity(codState: string): 'info' | 'warn' | 'success' | 'secondary' {
    switch (codState) {
      case 'SEED_BORRADOR':
        return 'info';
      case 'ACEPTADO':
        return 'warn';
      case 'SEED_CONTRATADO':
        return 'success';
      default:
        return 'secondary';
    }
  }

  abrir(item: QuoteListItem): void {
    this.router.navigate(['/cotizacion', item.ideQuote]);
  }

  nueva(): void {
    this.router.navigate(['/cotizacion/nueva']);
  }
}
