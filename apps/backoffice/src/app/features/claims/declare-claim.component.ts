import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { ContractDetail, ContractListItem, ContractRisk, ContractsService } from '../contracts/contracts.service';
import { ClaimsApiService } from './claims.service';

const CURRENCIES_PATH = '/product-rating/currencies';
const CLAIM_TYPES_PATH = '/claims/claim-types';
const CLAIM_EVENTS_PATH = '/claims/claim-events';

/**
 * Declarar un siniestro (`POST /claims/claims`) -- Fase 4 (Siniestros),
 * Etapa 1, 2026-09-24. Flujo: buscar el contrato afectado (por
 * `NumContract`, reutilizando `ContractsService` de `underwriting-service`
 * -- no se duplica esa búsqueda en `claims-service`, ver el doc-comment
 * de `DeclareClaimDto` en el backend real), elegir tipo/evento de
 * siniestro, moneda y fechas, y marcar qué riesgos del contrato quedaron
 * afectados. El backend hace el resto de la cascada (expediente de
 * siniestro, provisiones iniciales por cobertura, checklist de
 * requisitos) en una sola transacción.
 *
 * Los tipos de siniestro se filtran en el cliente por el producto del
 * contrato ya cargado (`SClaimType.IdeProduct`) -- no hay un endpoint
 * `?codProduct=` en `claim-types` todavía, y la lista de tipos de
 * siniestro en la práctica es chica, así que no vale la pena agregarlo
 * para esta primera vuelta.
 */
@Component({
  selector: 'app-declare-claim',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    CheckboxModule,
    TableModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './declare-claim.component.html',
})
export class DeclareClaimComponent {
  private readonly fb = inject(FormBuilder);
  private readonly contractsService = inject(ContractsService);
  private readonly catalogService = inject(CatalogService);
  private readonly claimsApi = inject(ClaimsApiService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly searching = signal(false);
  readonly searchResults = signal<ContractListItem[]>([]);
  readonly contract = signal<ContractDetail | null>(null);
  readonly submitting = signal(false);

  readonly allClaimTypes = signal<CatalogRow[]>([]);
  readonly claimEvents = signal<CatalogRow[]>([]);
  readonly currencies = signal<CatalogRow[]>([]);
  readonly selectedRiskIds = signal<Set<string>>(new Set());

  /** `TContractFile` "vigente" -- en la práctica hoy siempre hay exactamente uno por contrato (ver comentario de cabecera de `ContractsService.copyRisksAndCoverages` en el backend real). */
  readonly contractFile = computed(() => this.contract()?.TContractFile[0] ?? null);
  /** Filtrados por el producto del contrato ya cargado -- el backend
   *  igual revalida esto (`ClaimsService.declare`), pero mostrar acá
   *  tipos de siniestro de OTRO producto solo confunde. */
  readonly claimTypes = computed(() => {
    const codProduct = this.contract()?.SProduct.CodProduct;
    if (!codProduct) return [];
    return this.allClaimTypes().filter(
      (row) => (row['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === codProduct,
    );
  });

  searchForm = this.fb.nonNullable.group({ numContract: ['', Validators.required] });

  form = this.fb.nonNullable.group({
    codClaimType: ['', Validators.required],
    codClaimEvent: ['', Validators.required],
    codCurrency: ['', Validators.required],
    tstOcurrence: ['', Validators.required],
    tstNotification: ['', Validators.required],
    tstConstitution: ['', Validators.required],
    desLarge: [''],
  });

  constructor() {
    this.catalogService.list(CLAIM_TYPES_PATH).subscribe({ next: (rows) => this.allClaimTypes.set(rows) });
    this.catalogService.list(CURRENCIES_PATH).subscribe({ next: (rows) => this.currencies.set(rows) });
    this.form.controls.codClaimType.valueChanges.subscribe((codClaimType) => {
      this.form.patchValue({ codClaimEvent: '' }, { emitEvent: false });
      this.claimEvents.set([]);
      if (!codClaimType) return;
      this.catalogService.list(CLAIM_EVENTS_PATH, { codClaimType }).subscribe({ next: (rows) => this.claimEvents.set(rows) });
    });
  }

  buscarContrato(): void {
    if (this.searchForm.invalid) return;
    this.searching.set(true);
    const { numContract } = this.searchForm.getRawValue();
    this.contractsService.list({ filterNumContract: numContract, all: true, page: 1, limit: 10 }).subscribe({
      next: (result) => {
        this.searching.set(false);
        this.searchResults.set(result.items);
        if (result.items.length === 1) {
          this.seleccionarContrato(result.items[0]);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.searching.set(false);
        this.showError(err);
      },
    });
  }

  seleccionarContrato(item: ContractListItem): void {
    this.searching.set(true);
    this.contractsService.getContract(item.ideContract).subscribe({
      next: (detail) => {
        this.searching.set(false);
        this.contract.set(detail);
        this.searchResults.set([]);
        this.selectedRiskIds.set(new Set());
      },
      error: (err: HttpErrorResponse) => {
        this.searching.set(false);
        this.showError(err);
      },
    });
  }

  cambiarContrato(): void {
    this.contract.set(null);
    this.selectedRiskIds.set(new Set());
  }

  toggleRisk(risk: ContractRisk, checked: boolean): void {
    const next = new Set(this.selectedRiskIds());
    if (checked) next.add(risk.IdeFileRisk);
    else next.delete(risk.IdeFileRisk);
    this.selectedRiskIds.set(next);
  }

  isRiskSelected(risk: ContractRisk): boolean {
    return this.selectedRiskIds().has(risk.IdeFileRisk);
  }

  planLabel(risk: ContractRisk): string {
    const plan = risk.SPlanProductRisk?.SPlanProduct;
    return String(plan?.DesShort ?? plan?.DesPlanProduct ?? '');
  }

  riskLabel(risk: ContractRisk): string {
    return risk.DesFileRisk ?? risk.SRiskProduct?.DesShort ?? risk.SRiskProduct?.DesLarge ?? `#${risk.NumFileRisk}`;
  }

  submit(): void {
    const contractFile = this.contractFile();
    if (this.form.invalid || !contractFile || this.selectedRiskIds().size === 0) {
      this.form.markAllAsTouched();
      if (this.selectedRiskIds().size === 0) {
        this.messages.add({
          severity: 'warn',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('claims.declare.noRisksSelected'),
        });
      }
      return;
    }
    const raw = this.form.getRawValue();
    this.submitting.set(true);
    this.claimsApi
      .declare({
        codClaimType: raw.codClaimType,
        ideContractFile: contractFile.IdeContractFile,
        codClaimEvent: raw.codClaimEvent,
        codCurrency: raw.codCurrency,
        // Los 3 `<input type="datetime-local">` entregan
        // "YYYY-MM-DDTHH:mm" (sin segundos ni zona horaria) -- se
        // normaliza a ISO 8601 completo acá para que `@IsDateString()`
        // del backend lo acepte sin ambigüedad.
        tstOcurrence: new Date(raw.tstOcurrence).toISOString(),
        tstNotification: new Date(raw.tstNotification).toISOString(),
        tstConstitution: new Date(raw.tstConstitution).toISOString(),
        desLarge: raw.desLarge || undefined,
        ideFileRisks: [...this.selectedRiskIds()],
      })
      .subscribe({
        next: (claim) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('claims.declare.createdDetail', { numClaim: claim.NumClaim }),
          });
          this.router.navigate(['/siniestros', claim.IdeClaim]);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.showError(err);
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
