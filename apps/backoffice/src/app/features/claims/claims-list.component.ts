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
import { ClaimListItem, ClaimsApiService } from './claims.service';

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

  readonly items = signal<ClaimListItem[]>([]);
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
        this.items.set(items);
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

  nuevo(): void {
    this.router.navigate(['/siniestros', 'nuevo']);
  }

  abrir(item: ClaimListItem): void {
    this.router.navigate(['/siniestros', item.IdeClaim]);
  }
}
