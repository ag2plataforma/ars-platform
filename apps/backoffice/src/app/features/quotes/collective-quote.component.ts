import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { downloadBlob } from '../../core/files/file.util';
import { CollectiveInsuredRow, QuotePricingResult, QuotingService } from './quoting.service';
import { RiskAttributeField, RiskAttributesService, STEP_CODE_CUSTOM_ATTRIBUTES } from './risk-attributes.service';
import {
  InsuredRow,
  buildTemplateCsv,
  csvToInsuredRows,
  flagDuplicates,
  parseCsv,
  toPayload,
  validateInsuredRow,
} from './collective-csv.util';

const PRODUCTS_PATH = '/product-rating/products';
const DISTRIBUTION_CHANNELS_PATH = '/party/distribution-channels';
const DISTRIBUTION_WAYS_PATH = '/party/distribution-ways';
const RISK_PRODUCTS_PATH = '/product-rating/risk-products';
const IDENTIFICATION_TYPES_PATH = '/reference-data/identification-types';

type CollectiveStep = 'setup' | 'insureds' | 'plan';

interface PlanOption {
  codPlanProduct: string;
  desShortPlan: string;
  desLargePlan: string | null;
  total: number;
}

function buildValidators(validators: RiskAttributeField['validators']): ValidatorFn[] {
  const result: ValidatorFn[] = [];
  for (const v of validators ?? []) {
    const props = v.aditionalProps ?? {};
    switch (v.validationName) {
      case 'required':
        result.push(Validators.required);
        break;
      case 'min':
        if (typeof props['min'] === 'number') result.push(Validators.min(props['min']));
        break;
      case 'max':
        if (typeof props['max'] === 'number') result.push(Validators.max(props['max']));
        break;
      case 'maxLength':
        if (typeof props['maxLength'] === 'number') result.push(Validators.maxLength(props['maxLength']));
        break;
    }
  }
  return result;
}

/**
 * Cotización de un colectivo (etapa 1): un tomador con N asegurados, una prima por certificado.
 * Pasos: (1) producto colectivo y tipo de riesgo, (2) asegurados (a mano o desde un CSV),
 * (3) plan único para todos + prima de cada asegurado. Desde ahí se continúa en el flujo normal
 * de cotización (`/cotizacion/:id`: tomador/titular, resumen, aceptar, contratar).
 */
@Component({
  selector: 'app-collective-quote',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    RadioButtonModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './collective-quote.component.html',
})
export class CollectiveQuoteComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly quoting = inject(QuotingService);
  private readonly riskAttributes = inject(RiskAttributesService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  readonly step = signal<CollectiveStep>('setup');

  // --- Paso 1: producto ---
  readonly products = signal<CatalogRow[]>([]);
  readonly distributionChannels = signal<CatalogRow[]>([]);
  readonly distributionWays = signal<CatalogRow[]>([]);
  readonly identificationTypes = signal<CatalogRow[]>([]);
  private allRiskProducts: CatalogRow[] = [];
  readonly riskProductOptions = signal<CatalogRow[]>([]);
  readonly loadingFields = signal(false);

  setupForm = this.fb.nonNullable.group({
    codProduct: ['', Validators.required],
    codDistributionChannel: ['', Validators.required],
    codDistributionWay: ['', Validators.required],
    codRiskProduct: ['', Validators.required],
  });

  // --- Paso 2: asegurados ---
  readonly fields = signal<RiskAttributeField[]>([]);
  readonly insureds = signal<InsuredRow[]>([]);
  private nextKey = 1;
  readonly creating = signal(false);
  readonly dialogVisible = signal(false);
  private editingKey: number | null = null;
  insuredForm: FormGroup = this.buildInsuredForm();

  readonly invalidCount = computed(() => this.insureds().filter((row) => row.errors.length > 0).length);
  readonly canQuote = computed(() => this.insureds().length > 0 && this.invalidCount() === 0 && !this.creating());

  // --- Paso 3: plan ---
  readonly pricing = signal<QuotePricingResult | null>(null);
  readonly insuredRows = signal<CollectiveInsuredRow[]>([]);
  readonly chosenPlan = signal<string | null>(null);
  readonly appliedPlan = signal<string | null>(null);
  readonly applyingPlan = signal(false);
  readonly retryingPricing = signal(false);
  private ideQuote: string | null = null;

  readonly planOptions = computed<PlanOption[]>(() => {
    const result = this.pricing();
    if (!result) return [];
    const byCode = new Map<string, PlanOption>();
    for (const risk of result.risks) {
      for (const plan of risk.plans) {
        const current = byCode.get(plan.codPlanProduct);
        if (current) {
          current.total = Math.round((current.total + plan.basePrice) * 100) / 100;
        } else {
          byCode.set(plan.codPlanProduct, {
            codPlanProduct: plan.codPlanProduct,
            desShortPlan: plan.desShortPlan ?? plan.codPlanProduct,
            desLargePlan: plan.desLargePlan,
            total: plan.basePrice,
          });
        }
      }
    }
    return [...byCode.values()];
  });

  /** Prima de cada asegurado con el plan elegido (en el orden de carga). */
  readonly premiumRows = computed(() => {
    const result = this.pricing();
    const code = this.chosenPlan();
    if (!result || !code) return [];
    return this.insuredRows().map((insured) => {
      const risk = result.risks.find((r) => r.ideQuoteRisk === insured.IdeQuoteRisk);
      const plan = risk?.plans.find((p) => p.codPlanProduct === code);
      return { insured, prime: plan?.basePrice ?? 0 };
    });
  });

  readonly chosenTotal = computed(() => {
    const code = this.chosenPlan();
    return this.planOptions().find((p) => p.codPlanProduct === code)?.total ?? 0;
  });

  constructor() {
    this.catalogService.list(PRODUCTS_PATH).subscribe({
      next: (rows) => this.products.set(rows.filter((row) => row['IndCollective'] === true)),
    });
    this.catalogService.list(DISTRIBUTION_CHANNELS_PATH).subscribe({ next: (rows) => this.distributionChannels.set(rows) });
    this.catalogService.list(DISTRIBUTION_WAYS_PATH).subscribe({ next: (rows) => this.distributionWays.set(rows) });
    this.catalogService.list(IDENTIFICATION_TYPES_PATH).subscribe({ next: (rows) => this.identificationTypes.set(rows) });
    this.catalogService.list(RISK_PRODUCTS_PATH).subscribe({
      next: (rows) => {
        this.allRiskProducts = rows;
        this.refreshRiskProducts();
      },
    });
  }

  // --- Paso 1 ---

  onProductChange(): void {
    this.setupForm.controls.codRiskProduct.setValue('');
    this.refreshRiskProducts();
  }

  private refreshRiskProducts(): void {
    const codProduct = this.setupForm.controls.codProduct.value;
    this.riskProductOptions.set(
      codProduct
        ? this.allRiskProducts.filter(
            (row) => (row['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === codProduct,
          )
        : [],
    );
    // Si el producto tiene un único tipo de riesgo, se elige solo.
    const options = this.riskProductOptions();
    if (options.length === 1) this.setupForm.controls.codRiskProduct.setValue(String(options[0]['CodRiskProduct']));
  }

  riskLabel(row: CatalogRow): string {
    const risk = row['SRisk'] as Record<string, unknown> | undefined;
    return risk ? String(risk['DesRisk'] ?? row['CodRiskProduct']) : String(row['CodRiskProduct'] ?? '');
  }

  continueToInsureds(): void {
    if (this.setupForm.invalid) {
      this.setupForm.markAllAsTouched();
      return;
    }
    const raw = this.setupForm.getRawValue();
    const riskRow = this.riskProductOptions().find((r) => r['CodRiskProduct'] === raw.codRiskProduct);
    if (!riskRow) return;
    const ideRiskProduct = String(riskRow['IdeRiskProduct']);

    this.loadingFields.set(true);
    const flow$ = this.riskAttributes.resolveActiveSteps({
      codProduct: raw.codProduct,
      codDistributionChannel: raw.codDistributionChannel,
      codRiskProduct: raw.codRiskProduct,
      codDistributionWay: raw.codDistributionWay || undefined,
    });
    forkJoin({ schema: this.riskAttributes.getSchema(ideRiskProduct), flow: flow$ ?? of(null) }).subscribe({
      next: ({ schema, flow }) => {
        const stepActive = !flow || flow.codProcessFlow === null || flow.activeSteps.includes(STEP_CODE_CUSTOM_ATTRIBUTES);
        this.fields.set(stepActive ? schema.fields : []);
        // El formulario del diálogo se construyó (vacío) al crear el componente: hay que
        // rehacerlo con los campos personalizados recién cargados, o la plantilla pide
        // controles que no existen (`formControlName` sobre null) y la pantalla queda en blanco.
        this.insuredForm = this.buildInsuredForm();
        this.insureds.set([]);
        this.loadingFields.set(false);
        this.step.set('insureds');
      },
      error: (err: HttpErrorResponse) => {
        this.loadingFields.set(false);
        this.showError(err);
      },
    });
  }

  // --- Paso 2: lista de asegurados ---

  identificationTypeCodes(): string[] {
    return this.identificationTypes().map((row) => String(row['CodIdentificationType']));
  }

  private buildInsuredForm(row?: InsuredRow): FormGroup {
    const attrs = this.fb.group({});
    for (const field of this.fields()) {
      const current = row?.attrs[field.ideAttributeProperty];
      const initial = current !== undefined ? current : field.type === 'checkbox' ? false : null;
      attrs.addControl(field.ideAttributeProperty, this.fb.control(initial, buildValidators(field.validators)));
    }
    return this.fb.group({
      codIdentificationType: [row?.codIdentificationType ?? ''],
      numIdentification: [row?.numIdentification ?? ''],
      desFirstName: [row?.desFirstName ?? '', Validators.required],
      desLastName1: [row?.desLastName1 ?? ''],
      desLastName2: [row?.desLastName2 ?? ''],
      desEmail: [row?.desEmail ?? '', [Validators.required, Validators.email]],
      tstBirthdate: [row?.tstBirthdate ?? ''],
      attrs,
    });
  }

  openAdd(): void {
    this.editingKey = null;
    this.insuredForm = this.buildInsuredForm();
    this.dialogVisible.set(true);
  }

  openEdit(row: InsuredRow): void {
    this.editingKey = row.key;
    this.insuredForm = this.buildInsuredForm(row);
    this.dialogVisible.set(true);
  }

  saveInsured(): void {
    if (this.insuredForm.invalid) {
      this.insuredForm.markAllAsTouched();
      return;
    }
    const raw = this.insuredForm.getRawValue() as {
      codIdentificationType: string;
      numIdentification: string;
      desFirstName: string;
      desLastName1: string;
      desLastName2: string;
      desEmail: string;
      tstBirthdate: string;
      attrs: Record<string, unknown>;
    };
    const row: InsuredRow = {
      key: this.editingKey ?? this.nextKey++,
      codIdentificationType: raw.codIdentificationType ?? '',
      numIdentification: raw.numIdentification ?? '',
      desFirstName: raw.desFirstName,
      desLastName1: raw.desLastName1 ?? '',
      desLastName2: raw.desLastName2 ?? '',
      desEmail: raw.desEmail,
      tstBirthdate: raw.tstBirthdate ?? '',
      attrs: raw.attrs,
      errors: [],
    };
    row.errors = validateInsuredRow(row, this.fields(), this.identificationTypeCodes());
    const key = this.editingKey;
    this.insureds.update((rows) => flagDuplicates(key === null ? [...rows, row] : rows.map((r) => (r.key === key ? row : r))));
    this.dialogVisible.set(false);
  }

  removeInsured(row: InsuredRow): void {
    this.insureds.update((rows) => flagDuplicates(rows.filter((r) => r.key !== row.key)));
  }

  clearInsureds(): void {
    this.insureds.set([]);
  }

  fieldInvalid(field: RiskAttributeField): boolean {
    const control = this.insuredForm.get(['attrs', field.ideAttributeProperty]);
    return !!control && control.invalid && control.touched;
  }

  /** Etiqueta de un valor de atributo para la tabla (resuelve ids de opciones a su texto). */
  attrLabel(field: RiskAttributeField, row: InsuredRow): string {
    const value = row.attrs[field.ideAttributeProperty];
    if (value === null || value === undefined || value === '') return '';
    if (field.type === 'select' || field.type === 'radio') {
      return String((field.options ?? []).find((o) => o.value === value)?.key ?? value);
    }
    if (field.type === 'checkbox') return value ? this.transloco.translate('common.yes') : this.transloco.translate('common.no');
    return String(value);
  }

  fullName(row: InsuredRow): string {
    return [row.desFirstName, row.desLastName1, row.desLastName2].filter(Boolean).join(' ');
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
    const csv = buildTemplateCsv(this.fields(), sample);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'plantilla-asegurados.csv');
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
      const text = await file.text();
      const { rows, structureErrors } = csvToInsuredRows(parseCsv(text), this.fields(), this.identificationTypeCodes(), this.nextKey);
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
      this.insureds.update((current) => flagDuplicates([...current, ...rows]));
      this.messages.add({
        severity: 'success',
        summary: this.transloco.translate('common.done'),
        detail: this.transloco.translate('collectiveQuote.fileLoadedDetail', { count: rows.length }),
      });
    } catch {
      this.messages.add({
        severity: 'error',
        summary: this.transloco.translate('collectiveQuote.fileErrorTitle'),
        detail: this.transloco.translate('collectiveQuote.fileReadError'),
      });
    }
  }

  backToSetup(): void {
    this.step.set('setup');
  }

  // --- Cotizar ---

  quote(): void {
    if (!this.canQuote()) return;
    const raw = this.setupForm.getRawValue();
    this.creating.set(true);
    this.quoting
      .createCollective({
        codProduct: raw.codProduct,
        codDistributionChannel: raw.codDistributionChannel,
        codDistributionWay: raw.codDistributionWay,
        codRiskProduct: raw.codRiskProduct,
        insureds: this.insureds().map(toPayload),
      })
      .subscribe({
        next: (created) => {
          this.ideQuote = created.ideQuote;
          this.creating.set(false);
          this.step.set('plan');
          this.calculatePricing();
        },
        error: (err: HttpErrorResponse) => {
          this.creating.set(false);
          this.showError(err);
        },
      });
  }

  /** Calcula el precio de todos los asegurados (puede tardar con listas largas). */
  calculatePricing(): void {
    if (!this.ideQuote) return;
    const ideQuote = this.ideQuote;
    this.retryingPricing.set(true);
    forkJoin({ pricing: this.quoting.price(ideQuote), insureds: this.quoting.listInsureds(ideQuote) }).subscribe({
      next: ({ pricing, insureds }) => {
        this.retryingPricing.set(false);
        this.pricing.set(pricing);
        this.insuredRows.set(insureds);
        const selected = pricing.risks.map((r) => r.plans.find((p) => p.indSelected)?.codPlanProduct ?? null);
        const same = selected.length > 0 && selected.every((code) => code && code === selected[0]);
        this.appliedPlan.set(same ? selected[0] : null);
        this.chosenPlan.set(same ? selected[0] : (this.planOptions()[0]?.codPlanProduct ?? null));
      },
      error: (err: HttpErrorResponse) => {
        this.retryingPricing.set(false);
        this.showError(err);
      },
    });
  }

  choosePlan(code: string): void {
    this.chosenPlan.set(code);
  }

  applyPlan(): void {
    const code = this.chosenPlan();
    if (!this.ideQuote || !code) return;
    this.applyingPlan.set(true);
    this.quoting.selectCollectivePlan(this.ideQuote, code).subscribe({
      next: (pricing) => {
        this.applyingPlan.set(false);
        this.pricing.set(pricing);
        this.appliedPlan.set(code);
      },
      error: (err: HttpErrorResponse) => {
        this.applyingPlan.set(false);
        this.showError(err);
      },
    });
  }

  continueToQuote(): void {
    if (this.ideQuote) this.router.navigate(['/cotizacion', this.ideQuote]);
  }

  volver(): void {
    this.router.navigate(['/cotizacion']);
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail, life: 10000 });
  }
}
