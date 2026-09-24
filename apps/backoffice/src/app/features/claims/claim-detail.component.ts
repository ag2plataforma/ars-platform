import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ClaimDetail, ClaimRequirement, ClaimRisk, ClaimsApiService } from './claims.service';

/**
 * Detalle de un siniestro puntual (`GET /claims/claims/:id`) -- Fase 4
 * (Siniestros), Etapa 1, 2026-09-24. A diferencia de `ContractDetailComponent`
 * (árbol de pestañas de 3 niveles), acá todo se muestra apilado en una
 * sola pantalla -- alcance mucho más chico (declarar + ver, sin
 * aprobación/pago todavía), no amerita esa complejidad por ahora.
 *
 * "Recibido" de un requisito: ver el doc-comment de
 * `ClaimRequirementsService` en el backend real -- la convención de
 * Etapa 1 es `TstRequest === TstReception` = "pendiente" (`isReceived`
 * compara ambas fechas).
 */
@Component({
  selector: 'app-claim-detail',
  standalone: true,
  imports: [CommonModule, ButtonModule, TableModule, TagModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  templateUrl: './claim-detail.component.html',
})
export class ClaimDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly claimsApi = inject(ClaimsApiService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly claim = signal<ClaimDetail | null>(null);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) this.load(id);
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.claimsApi.findOne(id).subscribe({
      next: (claim) => {
        this.claim.set(claim);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.showError(err);
      },
    });
  }

  riskLabel(risk: ClaimRisk): string {
    const fileRisk = risk.TFileRisk;
    return fileRisk.DesFileRisk ?? fileRisk.SRiskProduct?.DesShort ?? `#${fileRisk.NumFileRisk}`;
  }

  planLabel(risk: ClaimRisk): string {
    const plan = risk.TFileRisk.SPlanProductRisk?.SPlanProduct;
    return String(plan?.DesShort ?? plan?.DesPlanProduct ?? '');
  }

  requirementLabel(requirement: ClaimRequirement): string {
    const productRequirement = requirement.SProductRequirement;
    return String(productRequirement.DesShort ?? productRequirement.SRequirement.DesRequirement ?? '');
  }

  isReceived(requirement: ClaimRequirement): boolean {
    return requirement.TstReception !== requirement.TstRequest;
  }

  marcarRecibido(claimFileId: string, requirement: ClaimRequirement): void {
    this.claimsApi.markRequirementReceived(claimFileId, requirement.IdeClaimRequirement).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('claims.detail.requirementReceivedDetail'),
        });
        const id = this.claim()?.IdeClaim;
        if (id) this.load(id);
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  volver(): void {
    this.router.navigate(['/siniestros']);
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
