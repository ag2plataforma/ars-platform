import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { downloadBlob } from '../../core/files/file.util';
import { ContractDetail, ContractFile, ContractsService } from './contracts.service';
import { RiskAttributeField, RiskAttributesService } from '../quotes/risk-attributes.service';
import {
  InsuredRow,
  buildTemplateCsv,
  csvToInsuredRows,
  flagDuplicates,
  parseCsv,
  toPayload,
} from '../quotes/collective-csv.util';

const PLAN_PRODUCT_RISKS_PATH = '/product-rating/plan-product-risks';
const PRODUCT_ENDORSEMENTS_PATH = '/product-rating/product-endorsements';
const IDENTIFICATION_TYPES_PATH = '/reference-data/identification-types';

interface PlanProductRiskOption {
  IdePlanProductRisk: string;
  IdeRiskProduct: string;
  SPlanProduct: { DesShort: string | null; DesPlanProduct: string; SProduct: { CodProduct: string } };
  SRiskProduct: { DesShort: string | null; DesLarge: string | null };
  SState: { CodState: string };
}

interface ActiveCertificateRow {
  file: ContractFile;
  name: string;
  email: string;
}

/**
 * Colectivos -- altas y bajas MASIVAS de asegurados (etapa 2b): cada una es UN suplemento (una
 * operación y un único recibo SUP consolidado), todo o nada. El alta se carga desde un CSV (misma
 * plantilla y validaciones que la cotización colectiva); la baja se elige marcando certificados.
 */
@Component({
  selector: 'app-bulk-certificates',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './bulk-certificates.component.html',
})
export class BulkCertificatesComponent {
  private contractValue!: ContractDetail;
  /** Certificados activos YA calculados: la tabla de bajas necesita una referencia estable (un getter que
   *  devolviera un array nuevo en cada ciclo de detección de cambios haría recalcular la tabla sin parar). */
  activeCertificates: ActiveCertificateRow[] = [];

  @Input({ required: true })
  set contract(value: ContractDetail) {
    this.contractValue = value;
    this.activeCertificates = this.buildActiveCertificates(value);
    this.selected = [];
  }
  get contract(): ContractDetail {
    return this.contractValue;
  }
  /** Emite el contrato actualizado tras aplicar el suplemento. */
  @Output() applied = new EventEmitter<ContractDetail>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly contracts = inject(ContractsService);
  private readonly riskAttributes = inject(RiskAttributesService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly productEndorsements = signal<CatalogRow[]>([]);
  readonly identificationTypes = signal<CatalogRow[]>([]);
  readonly planOptions = signal<PlanProductRiskOption[]>([]);

  // --- alta masiva ---
  readonly addVisible = signal(false);
  readonly addSubmitting = signal(false);
  readonly fields = signal<RiskAttributeField[]>([]);
  readonly loadingFields = signal(false);
  readonly insureds = signal<InsuredRow[]>([]);
  private nextKey = 1;
  addForm = this.fb.nonNullable.group({
    idePlanProductRisk: ['', Validators.required],
    ideProductEndorsement: ['', Validators.required],
    tstSupplement: ['', Validators.required],
    desSupplement: ['', Validators.required],
  });
  readonly invalidCount = computed(() => this.insureds().filter((r) => r.errors.length > 0).length);
  readonly canSubmitAdd = computed(
    () => this.insureds().length > 0 && this.invalidCount() === 0 && !this.addSubmitting() && !this.loadingFields(),
  );

  // --- baja masiva ---
  readonly removeVisible = signal(false);
  readonly removeSubmitting = signal(false);
  selected: ActiveCertificateRow[] = [];
  removeForm = this.fb.nonNullable.group({
    ideProductEndorsement: ['', Validators.required],
    tstSupplement: ['', Validators.required],
    desSupplement: ['', Validators.required],
  });

  get isActive(): boolean {
    return this.contract?.SState.CodState === 'ACTIVO';
  }

  private buildActiveCertificates(contract: ContractDetail | undefined): ActiveCertificateRow[] {
    return (contract?.TContractFile ?? [])
      .filter((f) => f.SState.CodState === 'ACTIVO')
      .map((file) => {
        const person = file.TContractFilePerson?.find((p) => p.SPersonRol?.CodPersonRol === 'ASEGURADO')?.TPerson;
        return {
          file,
          name: person ? [person.DesFirstName, person.DesLastName1].filter(Boolean).join(' ') : '',
          email: person?.DesEmail ?? '',
        };
      });
  }

  // ------------------------------------------------------------------ alta masiva

  openAdd(): void {
    this.addForm.reset({ idePlanProductRisk: '', ideProductEndorsement: '', tstSupplement: '', desSupplement: '' });
    this.insureds.set([]);
    this.fields.set([]);
    this.loadCatalogs();
    this.addVisible.set(true);
  }

  private loadCatalogs(): void {
    const codProduct = this.contract.SProduct.CodProduct;
    this.catalogService.list(PLAN_PRODUCT_RISKS_PATH).subscribe({
      next: (rows) =>
        this.planOptions.set(
          (rows as unknown as PlanProductRiskOption[]).filter(
            (row) => row.SPlanProduct.SProduct.CodProduct === codProduct && row.SState.CodState === 'ACTIVO',
          ),
        ),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.catalogService.list(IDENTIFICATION_TYPES_PATH).subscribe({
      next: (rows) => this.identificationTypes.set(rows),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  planLabel(row: PlanProductRiskOption): string {
    return `${row.SPlanProduct.DesShort ?? row.SPlanProduct.DesPlanProduct} / ${row.SRiskProduct.DesShort ?? row.SRiskProduct.DesLarge ?? ''}`;
  }

  /** Al elegir plan se cargan los campos personalizados de su tipo de riesgo (columnas extra del CSV). */
  onPlanChange(): void {
    const option = this.planOptions().find((p) => p.IdePlanProductRisk === this.addForm.controls.idePlanProductRisk.value);
    this.insureds.set([]);
    this.fields.set([]);
    if (!option) return;
    this.loadingFields.set(true);
    this.riskAttributes.getSchema(option.IdeRiskProduct).subscribe({
      next: (schema) => {
        this.fields.set(schema.fields);
        this.loadingFields.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loadingFields.set(false);
        this.showError(err);
      },
    });
  }

  identificationTypeCodes(): string[] {
    return this.identificationTypes().map((row) => String(row['CodIdentificationType']));
  }

  downloadTemplate(): void {
    const sample = [
      this.identificationTypeCodes()[0] ?? '',
      '12345678A',
      'Ana',
      'García',
      'López',
      'ana@ejemplo.com',
      '1990-05-17',
      ...this.fields().map((f) => this.sampleValue(f)),
    ];
    downloadBlob(new Blob([buildTemplateCsv(this.fields(), sample)], { type: 'text/csv;charset=utf-8' }), 'plantilla-asegurados.csv');
  }

  private sampleValue(field: RiskAttributeField): string {
    switch (field.type) {
      case 'select':
      case 'radio':
        return String(field.options?.[0]?.key ?? '');
      case 'checkbox':
        return 'no';
      case 'number':
        return '0';
      case 'date':
        return '2020-01-31';
      default:
        return 'texto';
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const { rows, structureErrors } = csvToInsuredRows(
        parseCsv(await file.text()),
        this.fields(),
        this.identificationTypeCodes(),
        this.nextKey,
      );
      if (structureErrors.length > 0) {
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('collectiveQuote.fileErrorTitle'),
          detail: structureErrors.join(' '),
          life: 8000,
        });
        return;
      }
      this.nextKey += rows.length;
      this.insureds.set(flagDuplicates(rows));
    } catch {
      this.messages.add({
        severity: 'error',
        summary: this.transloco.translate('collectiveQuote.fileErrorTitle'),
        detail: this.transloco.translate('collectiveQuote.fileReadError'),
      });
    }
  }

  removeRow(row: InsuredRow): void {
    this.insureds.update((rows) => flagDuplicates(rows.filter((r) => r.key !== row.key)));
  }

  fullName(row: InsuredRow): string {
    return [row.desFirstName, row.desLastName1, row.desLastName2].filter(Boolean).join(' ');
  }

  submitAdd(): void {
    if (this.addForm.invalid || !this.canSubmitAdd()) {
      this.addForm.markAllAsTouched();
      return;
    }
    const raw = this.addForm.getRawValue();
    this.addSubmitting.set(true);
    this.contracts
      .addCertificates(this.contract.IdeContract, {
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
        idePlanProductRisk: raw.idePlanProductRisk,
        insureds: this.insureds().map(toPayload),
      })
      .subscribe({
        next: (result) => {
          this.addSubmitting.set(false);
          this.addVisible.set(false);
          this.applied.emit(result);
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('bulkCertificates.addApplied', { count: this.insureds().length }),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.addSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  // ------------------------------------------------------------------ baja masiva

  openRemove(): void {
    this.selected = [];
    this.removeForm.reset({ ideProductEndorsement: '', tstSupplement: '', desSupplement: '' });
    this.catalogService.list(PRODUCT_ENDORSEMENTS_PATH, { codProduct: this.contract.SProduct.CodProduct }).subscribe({
      next: (rows) => this.productEndorsements.set(rows.filter((row) => row.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.removeVisible.set(true);
  }

  submitRemove(): void {
    if (this.removeForm.invalid || this.selected.length === 0) {
      this.removeForm.markAllAsTouched();
      return;
    }
    const raw = this.removeForm.getRawValue();
    const count = this.selected.length;
    this.removeSubmitting.set(true);
    this.contracts
      .removeCertificates(this.contract.IdeContract, {
        ideContractFiles: this.selected.map((s) => s.file.IdeContractFile),
        ideProductEndorsement: raw.ideProductEndorsement,
        tstSupplement: raw.tstSupplement,
        desSupplement: raw.desSupplement,
      })
      .subscribe({
        next: (result) => {
          this.removeSubmitting.set(false);
          this.removeVisible.set(false);
          this.applied.emit(result);
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('bulkCertificates.removeApplied', { count }),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.removeSubmitting.set(false);
          this.showError(err);
        },
      });
  }

  private showError(err: HttpErrorResponse): void {
    const message = err.error?.message;
    this.messages.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: Array.isArray(message) ? message.join(' · ') : (message ?? err.message),
      life: 10000,
    });
  }
}
