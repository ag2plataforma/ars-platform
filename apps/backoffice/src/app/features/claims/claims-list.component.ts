import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ClaimListItem, ClaimPriority, ClaimsApiService } from './claims.service';

/** Orden de la prioridad para poder ordenar la columna (sin triage = al final). */
const PRIORITY_RANK: Record<ClaimPriority, number> = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAJA: 3 };

/** Fila del listado: el siniestro + el rango de prioridad derivado (campo de orden). */
export type ClaimRow = ClaimListItem & { PriorityRank: number };

/**
 * Listado de siniestros (`GET /claims`) -- landing de "Siniestros" en el
 * sidebar (`/siniestros`). Sin paginación server-side (a diferencia de
 * `ContractsListComponent`) -- alcance acordado con el usuario para
 * Etapa 1 (ver docs/02-roadmap.md, Fase 4): el volumen esperado en esta
 * primera vuelta es bajo, y `ClaimsService.findAll` en el backend real
 * ya devuelve un arreglo simple, no paginado.
 */
@Component({
  selector: 'app-claims-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, TableModule, TagModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  templateUrl: './claims-list.component.html',
})
export class ClaimsListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly claims = inject(ClaimsApiService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly items = signal<ClaimRow[]>([]);
  readonly loading = signal(false);

  filters = this.fb.nonNullable.group({ filterNumClaim: [''] });

  constructor() {
    this.load();
    this.filters.valueChanges.subscribe(() => this.load());
  }

  load(): void {
    this.loading.set(true);
    const { filterNumClaim } = this.filters.getRawValue();
    this.claims.list(filterNumClaim || undefined).subscribe({
      next: (items) => {
        this.items.set(
          items.map((item) => ({ ...item, PriorityRank: item.Triage ? PRIORITY_RANK[item.Triage.CodPriority] : 9 })),
        );
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

  /** Estado real de la carpeta (`TClaimFile.SState`) -- un solo `TClaimFile`
   *  por siniestro en esta primera vuelta (ver el doc-comment de
   *  `ClaimListItem`). El `SState` de `TClaim` en sí no se muestra: sigue
   *  siendo el placeholder "sin transición" de Etapa 1. */
  fileState(item: ClaimListItem) {
    return item.TClaimFile[0]?.SState ?? null;
  }

  fileStateSeverity(item: ClaimListItem): 'success' | 'danger' | 'warn' | 'secondary' {
    const codState = this.fileState(item)?.CodState;
    if (codState === 'APROBADO' || codState === 'PAGADO' || codState === 'CERRADO') return 'success';
    if (codState === 'RECHAZADO') return 'danger';
    if (!codState) return 'secondary';
    return 'warn';
  }

  prioritySeverity(priority: ClaimPriority): 'danger' | 'warn' | 'info' | 'secondary' {
    switch (priority) {
      case 'URGENTE':
        return 'danger';
      case 'ALTA':
        return 'warn';
      case 'NORMAL':
        return 'info';
      default:
        return 'secondary';
    }
  }

  nuevo(): void {
    this.router.navigate(['/siniestros', 'nuevo']);
  }

  abrir(item: ClaimListItem): void {
    this.router.navigate(['/siniestros', item.IdeClaim]);
  }
}
