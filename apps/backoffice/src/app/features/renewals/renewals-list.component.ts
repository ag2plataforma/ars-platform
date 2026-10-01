import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ContractsService, RenewalCandidate } from '../contracts/contracts.service';

/**
 * Pantalla "Renovaciones" (Etapa 2 de "Gestión de renovaciones", ver
 * docs/02-roadmap.md) -- lista los contratos Activos candidatos a
 * renovar (dentro de la ventana `RENEWAL_CANDIDATE_WINDOW_DAYS` del
 * backend, configurable por `.env`, no desde acá) y permite al operador
 * marcar/desmarcar "No renovar" sobre cada uno. Alcance "simple" acordado
 * con el usuario para esta primera vuelta: sin filtros ni búsqueda
 * todavía (la lista de candidatos, acotada a una ventana de días, ya es
 * manejable sin eso).
 *
 * Los contratos marcados "No renovar" quedan igual en la lista (no se
 * ocultan) -- el operador tiene que poder deshacer la marca desde la
 * misma pantalla, no solo ponerla. La Etapa 3 (cron de renovación
 * automática, todavía no implementado) es la que de verdad va a excluir
 * estos contratos al renovar.
 */
@Component({
  selector: 'app-renewals-list',
  standalone: true,
  imports: [CommonModule, ButtonModule, TableModule, TagModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  templateUrl: './renewals-list.component.html',
})
export class RenewalsListComponent implements OnInit {
  private readonly contracts = inject(ContractsService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly items = signal<RenewalCandidate[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  /** `IdeContract` de la fila cuyo toggle está en curso -- deshabilita
   *  SOLO ese botón mientras responde, no toda la tabla. */
  readonly togglingId = signal<string | null>(null);

  private lastLimit = 20;

  ngOnInit(): void {
    this.fetch(1, this.lastLimit);
  }

  load(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.lastLimit;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    this.fetch(page, rows);
  }

  private fetch(page: number, limit: number): void {
    this.lastLimit = limit;
    this.loading.set(true);
    this.contracts.listRenewalCandidates(page, limit).subscribe({
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

  toggleNoRenovar(item: RenewalCandidate): void {
    const next = !item.indNoRenovar;
    this.togglingId.set(item.ideContract);
    this.contracts.setRenewalOptOut(item.ideContract, next).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.items.update((rows) =>
          rows.map((row) => (row.ideContract === item.ideContract ? { ...row, indNoRenovar: next } : row)),
        );
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate(next ? 'renewalsList.markedNoRenewDetail' : 'renewalsList.unmarkedNoRenewDetail'),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.togglingId.set(null);
        this.showError(err);
      },
    });
  }

  abrir(item: RenewalCandidate): void {
    this.router.navigate(['/contratos', item.ideContract]);
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
