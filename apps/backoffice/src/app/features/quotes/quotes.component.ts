import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import {
  QuotePricingResult,
  QuoteRisk,
  QuotePlan,
  QuoteCoverage,
  QuotePerson,
  QuoteSummary,
  QuoteRequirementRow,
  QuotingService,
  SubmitSocialImpactAnswersPayload,
} from './quoting.service';
import { MOBILE_PHONE_CONTACT_CLASS, Person, PersonsService } from '../../core/party/persons.service';
import { RiskAttributeField, RiskAttributesService, STEP_CODE_CUSTOM_ATTRIBUTES } from './risk-attributes.service';

const PRODUCTS_PATH = '/product-rating/products';
const DISTRIBUTION_CHANNELS_PATH = '/party/distribution-channels';
const DISTRIBUTION_WAYS_PATH = '/party/distribution-ways';
const RISK_PRODUCTS_PATH = '/product-rating/risk-products';

type QuoteStep = 'form' | 'plans' | 'socialImpact' | 'persons' | 'requirements' | 'summary' | 'contract';

/** Un "slot" de persona a asociar a la cotización (Tomador/Titular --
 * los dos únicos roles que `ContractsService.setContractPersons` copia
 * al contrato, confirmado contra su código real). Buscar
 * (`PersonsService.lookup`, por número de identificación) o, si no
 * existe, crear (`PersonsService.create`) y en ambos casos asociar
 * (`QuotingService.setPerson`). */
function buildPersonSlot(fb: FormBuilder, code: string, label: string) {
  return {
    code,
    label,
    searchControl: fb.control(''),
    createForm: fb.nonNullable.group({
      desFirstName: ['', Validators.required],
      desLastName1: [''],
      desEmail: ['', [Validators.required, Validators.email]],
      numIdentification: [''],
    }),
    // Dirección + teléfono móvil -- exigidos por
    // `ContractsService.assertPersonsReadyForIssuance` antes de poder
    // generar el contrato (ver docs/02-roadmap.md). Se piden recién acá,
    // una vez que la persona ya está asignada a la cotización.
    contactForm: fb.nonNullable.group({
      desAddressLine1: ['', Validators.required],
      desAddressLine2: [''],
      codPostal: ['', Validators.required],
      mobilePhone: ['', Validators.required],
    }),
    found: signal<Person | null>(null),
    notFound: signal(false),
    searching: signal(false),
    savingContact: signal(false),
  };
}

type PersonSlot = ReturnType<typeof buildPersonSlot>;

/** Mapea un validador de `AttributeContent` (confirmado contra datos
 * reales, ver `RiskAttributesService`) a un `ValidatorFn` de Angular.
 * Un `validationName` no reconocido se ignora -- no bloquea el
 * formulario, para no romper si el backend agrega un tipo nuevo. */
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

/** Estado de los campos personalizados de UN riesgo agregado en Etapa 1
 * (ej. "Raza"/"Edad" para "Perro") -- uno por cada fila de
 * `selectedRisks()`, indexado por `CodRiskProduct` en
 * `QuotesComponent.riskFieldsMap`. `form` se arma dinámicamente al
 * llegar el schema (`RiskAttributesService.getSchema`), con un control
 * por campo cuya clave es `IdeAttributeProperty` -- así
 * `form.getRawValue()` ya queda en el shape exacto que espera
 * `riskAttributeValue` en el backend, sin tener que remapear nada. */
function buildRiskFieldsState(fb: FormBuilder, codRiskProduct: string) {
  return {
    codRiskProduct,
    loading: signal(true),
    fields: signal<RiskAttributeField[]>([]),
    form: fb.group({}),
  };
}

type RiskFieldsState = ReturnType<typeof buildRiskFieldsState>;

/**
 * "Cotización" -- construida por etapas (decisión explícita del usuario,
 * `AskUserQuestion`: por etapas en vez de todo el wizard de una vez, y
 * luego "de a una" para cada pieza siguiente). Flujo completo tal como
 * quedó (ver docs/02-roadmap.md, Fase 2, para el detalle de cada etapa):
 *
 * 1. Crear la cotización (producto + canal/vía de distribución + al
 *    menos un riesgo) y cotizarla (`POST /quotes` + `.../price`,
 *    equivalente real a `FQuote('QUOTEPRICING',...)`).
 * 2. Elegir un plan por riesgo (`PATCH .../plans/:id/select`) y
 *    seleccionar/deseleccionar sus coberturas opcionales
 *    (`PATCH .../coverages/:id`).
 * 3. Asociar personas -- Tomador y Titular (`PUT .../persons`).
 * 4. Resumen de la cotización (`GET .../summary`, equivalente a
 *    `FGetQuoteSummary`).
 * 5. Aceptar (`POST .../state` con `codOperative: 'Aceptar'`) y generar
 *    el contrato (`POST .../contract`, la cascada completa de
 *    `ContractsService.create`).
 *
 * IMPORTANTE sobre la etapa 5: confirmado contra el código real que
 * `ContractsService.create` exige que la cotización ya esté en el
 * estado literal "Aceptado" (`getStateByCode('Aceptado')`), y que TODA
 * la cascada de cotización/contrato depende de que `SEntity`/`SStateRule`
 * estén configurados para las entidades que participan. Una
 * investigación anterior había encontrado la BD real sin ninguna fila
 * de esa configuración -- confirmado contra la BD real (ver
 * `packages/database/scripts/investigate-state-machine-config.js`) que
 * eso ya NO es así: existen 20 `SEntity`/50 `SStateRule` reales, pero
 * son los del fixture de prueba (`seed-contract-testing-fixtures.js`),
 * con estados propios prefijados `SEED_` (`SEED_BORRADOR`,
 * `SEED_CONTRATADO`, etc.) -- deliberadamente simplificados, NO los
 * estados reales del legado (ver el propio comentario de cabecera de
 * ese script). `SState`/`SStateRule`/`SEntity` NO están particionados
 * por producto (no hay `IdeProduct` en `SStateRule`): es una máquina de
 * estados GLOBAL, así que esta configuración de prueba ya alcanza para
 * que "Aceptar cotización"/"Generar contrato" funcionen contra
 * CUALQUIER producto, incluido uno real -- confirmado en la práctica,
 * el usuario cotizó y contrató de punta a punta con éxito. Punto
 * abierto, sin resolver todavía (ver `docs/02-roadmap.md`): si estos
 * estados `SEED_` quedan como la configuración definitiva, o si en
 * algún momento se investigan y migran los estados reales del legado
 * para mayor fidelidad -- no bloquea nada de lo que sigue.
 *
 * Sin pantalla de "listado de cotizaciones": `underwriting-service` hoy
 * solo expone `GET /quotes/:id` (una por id), no un `GET /quotes` que
 * liste todas -- confirmado contra `quotes.controller.ts` real, no es
 * una omisión de este componente. Por eso esta pantalla es un flujo
 * único (crear -> cotizar -> elegir plan -> personas -> resumen ->
 * aceptar/contratar), no un maestro-detalle como "Productos".
 */
@Component({
  selector: 'app-quotes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    RadioButtonModule,
    SelectModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './quotes.component.html',
})
export class QuotesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly quoting = inject(QuotingService);
  private readonly persons = inject(PersonsService);
  private readonly riskAttributes = inject(RiskAttributesService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly products = signal<CatalogRow[]>([]);
  readonly distributionChannels = signal<CatalogRow[]>([]);
  readonly distributionWays = signal<CatalogRow[]>([]);
  readonly riskProductOptions = signal<CatalogRow[]>([]);
  readonly selectedRisks = signal<CatalogRow[]>([]);

  readonly creating = signal(false);
  readonly pricing = signal<QuotePricingResult | null>(null);
  readonly step = signal<QuoteStep>('form');
  private ideQuote: string | null = null;
  private numQuote: string | null = null;

  // --- Etapa 2.5: Impacto Social (Fase 3 Etapa 2, ver docs/02-roadmap.md) ---
  /** Opciones del único select de valor fijo de este formulario --
   *  mismos 5 valores que valida `CarFuelType` en el backend real
   *  (`SubmitSocialImpactAnswersDto`/`CalculateSocialImpactScoreDto`). */
  readonly carFuelTypeOptions = [
    { value: 'gasolina', labelKey: 'quotes.socialImpactFuelGasolina' },
    { value: 'diesel', labelKey: 'quotes.socialImpactFuelDiesel' },
    { value: 'hibrido', labelKey: 'quotes.socialImpactFuelHibrido' },
    { value: 'electrico', labelKey: 'quotes.socialImpactFuelElectrico' },
    { value: 'no_tiene', labelKey: 'quotes.socialImpactFuelNoTiene' },
  ];
  readonly submittingSocialImpact = signal(false);
  socialImpactForm = this.fb.nonNullable.group({
    carKmPerYear: [0, [Validators.required, Validators.min(0)]],
    carFuelType: ['', Validators.required],
    electricityKwhMonth: [0, [Validators.required, Validators.min(0)]],
    flightsPerYear: [0, [Validators.required, Validators.min(0)]],
    volunteerHoursPerYear: [0, [Validators.required, Validators.min(0)]],
    recurringCause: [false],
    regularDonations: [false],
  });

  // --- Etapa 3: personas ---
  readonly personSlots: PersonSlot[] = [
    buildPersonSlot(this.fb, 'TOMADOR', 'quotes.personSlotTomador'),
    buildPersonSlot(this.fb, 'TITULAR', 'quotes.personSlotTitular'),
  ];
  readonly quotePersons = signal<QuotePerson[]>([]);

  // --- Etapa 3.5: Requisitos (checklist, ver goToSummary más abajo) ---
  readonly requirementRows = signal<QuoteRequirementRow[]>([]);
  readonly loadingRequirements = signal(false);

  // --- Etapa 4: resumen ---
  readonly summary = signal<QuoteSummary | null>(null);

  // --- Etapa 5: aceptar / contratar ---
  readonly accepting = signal(false);
  readonly quoteAccepted = signal(false);
  readonly contracting = signal(false);
  readonly contractResult = signal<{ IdeContract: string; NumContract: string } | null>(null);

  /** Todos los `SRiskProduct` (de cualquier producto), cacheados una
   * sola vez -- se filtran client-side por el producto elegido, mismo
   * criterio que ya usa `RiskProductsTabComponent` (el backend no
   * expone ese filtro en el `GET` de lista). */
  private allRiskProducts: CatalogRow[] = [];

  /** Campos personalizados por riesgo agregado (Etapa 1), indexado por
   * `CodRiskProduct` -- ver `buildRiskFieldsState`. */
  private readonly riskFieldsMap = new Map<string, RiskFieldsState>();

  form = this.fb.nonNullable.group({
    codProduct: ['', Validators.required],
    codDistributionChannel: ['', Validators.required],
    codDistributionWay: ['', Validators.required],
  });

  riskToAddControl = this.fb.control<string | null>(null);

  constructor() {
    this.catalogService.list(PRODUCTS_PATH).subscribe({ next: (rows) => this.products.set(rows) });
    this.catalogService
      .list(DISTRIBUTION_CHANNELS_PATH)
      .subscribe({ next: (rows) => this.distributionChannels.set(rows) });
    this.catalogService.list(DISTRIBUTION_WAYS_PATH).subscribe({ next: (rows) => this.distributionWays.set(rows) });
    this.catalogService.list(RISK_PRODUCTS_PATH).subscribe({
      next: (rows) => {
        this.allRiskProducts = rows;
        this.refreshRiskProductOptions();
      },
    });

    // `/cotizacion/:id` (retomar) vs `/cotizacion/nueva` (en blanco) --
    // ver `resumeQuote()`. Suscripción reactiva (no `snapshot`) por si
    // Angular llegara a reusar esta instancia entre dos ids distintos
    // (misma config de ruta, ':id'), aunque en el flujo real siempre se
    // navega acá desde el listado (`QuotesListComponent`).
    this.route.paramMap.subscribe((params) => {
      const ideQuoteParam = params.get('id');
      if (ideQuoteParam) {
        this.resumeQuote(ideQuoteParam);
      } else {
        this.nuevaCotizacion();
      }
    });
  }

  onProductChange(): void {
    // Los riesgos agregados pertenecen al producto anterior -- al
    // cambiar de producto ya no aplican.
    this.selectedRisks.set([]);
    this.riskFieldsMap.clear();
    this.riskToAddControl.setValue(null);
    this.refreshRiskProductOptions();
  }

  private refreshRiskProductOptions(): void {
    const codProduct = this.form.controls.codProduct.value;
    if (!codProduct) {
      this.riskProductOptions.set([]);
      return;
    }
    this.riskProductOptions.set(
      this.allRiskProducts.filter(
        (row) => (row['SProduct'] as Record<string, unknown> | undefined)?.['CodProduct'] === codProduct,
      ),
    );
  }

  riskLabel(row: CatalogRow): string {
    const risk = row['SRisk'] as Record<string, unknown> | undefined;
    const riskType = row['SRiskType'] as Record<string, unknown> | undefined;
    const desRisk = risk ? String(risk['DesRisk'] ?? '') : String(row['CodRiskProduct'] ?? '');
    const desRiskType = riskType ? String(riskType['DesRiskType'] ?? '') : '';
    return desRiskType ? `${desRisk} (${desRiskType})` : desRisk;
  }

  addRisk(): void {
    const codRiskProduct = this.riskToAddControl.value;
    if (!codRiskProduct) return;
    if (this.selectedRisks().some((row) => row['CodRiskProduct'] === codRiskProduct)) {
      this.riskToAddControl.setValue(null);
      return;
    }
    const row = this.riskProductOptions().find((r) => r['CodRiskProduct'] === codRiskProduct);
    if (!row) return;
    this.selectedRisks.update((current) => [...current, row]);
    this.riskToAddControl.setValue(null);
    this.loadRiskFields(row);
  }

  removeRisk(codRiskProduct: unknown): void {
    this.selectedRisks.update((current) => current.filter((row) => row['CodRiskProduct'] !== codRiskProduct));
    this.riskFieldsMap.delete(String(codRiskProduct));
  }

  /** Trae el schema de campos personalizados del riesgo recién agregado
   * (`RiskAttributesService`, ver su comentario) y arma su `FormGroup`
   * dinámico -- un control por `IdeAttributeProperty`, con los
   * validadores que declare cada campo. Un riesgo sin motor de
   * atributos configurado (`fields: []`) simplemente no pinta nada y no
   * bloquea "Cotizar". */
  private loadRiskFields(row: CatalogRow): void {
    const codRiskProduct = String(row['CodRiskProduct']);
    const ideRiskProduct = String(row['IdeRiskProduct']);
    const state = buildRiskFieldsState(this.fb, codRiskProduct);
    this.riskFieldsMap.set(codRiskProduct, state);

    // Además del schema (¿tiene este riesgo campos personalizados
    // configurados?), consulta si el flujo asignado al producto/canal
    // (`SProductProcessFlow`, pedido explícito del usuario, 2026-09-23)
    // deja ACTIVO el paso "Atributos personalizados" -- comportamiento
    // por defecto SEGURO: sin `codDistributionChannel` todavía elegido,
    // o sin ningún flujo configurado para la combinación
    // (`codProcessFlow: null`), no se oculta nada (ver el doc-comment de
    // `ProcessFlowResolver` en `@ars-platform/shared-common`).
    const codProduct = this.form.controls.codProduct.value;
    const codDistributionChannel = this.form.controls.codDistributionChannel.value;
    const codDistributionWay = this.form.controls.codDistributionWay.value;
    const activeSteps$ =
      codProduct && codDistributionChannel
        ? this.riskAttributes.resolveActiveSteps({
            codProduct,
            codDistributionChannel,
            codRiskProduct,
            codDistributionWay: codDistributionWay || undefined,
          })
        : of(null);

    forkJoin({ schema: this.riskAttributes.getSchema(ideRiskProduct), flow: activeSteps$ }).subscribe({
      next: ({ schema, flow }) => {
        const stepActive = !flow || flow.codProcessFlow === null || flow.activeSteps.includes(STEP_CODE_CUSTOM_ATTRIBUTES);
        const fields = stepActive ? schema.fields : [];
        for (const field of fields) {
          const initialValue = field.type === 'checkbox' ? false : null;
          state.form.addControl(field.ideAttributeProperty, this.fb.control(initialValue, buildValidators(field.validators)));
        }
        state.fields.set(fields);
        state.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        state.loading.set(false);
        this.showError(err);
      },
    });
  }

  /** Estado de campos personalizados de un riesgo ya agregado, para el
   * template (`@for` sobre `selectedRisks()`). */
  customFieldsFor(codRiskProduct: unknown): RiskFieldsState | undefined {
    return this.riskFieldsMap.get(String(codRiskProduct));
  }

  fieldInvalid(riskFields: RiskFieldsState, field: RiskAttributeField): boolean {
    const control = riskFields.form.get(field.ideAttributeProperty);
    return !!control && control.invalid && control.touched;
  }

  firstErrorMessage(riskFields: RiskFieldsState, field: RiskAttributeField): string {
    const control = riskFields.form.get(field.ideAttributeProperty);
    if (!control?.errors) return '';
    const key = Object.keys(control.errors)[0];
    return field.validationMessages[key] ?? this.transloco.translate<string>('quotes.invalidValueFallback');
  }

  /** Además de la validez del form base, exige que los campos
   * personalizados de CADA riesgo agregado ya hayan terminado de cargar
   * (`!loading`) y sean válidos -- evita cotizar con "Raza" vacía, que
   * es justo el bug que originó todo este formulario dinámico (ver
   * docs/02-roadmap.md). */
  canSubmit(): boolean {
    if (!this.form.valid || this.selectedRisks().length === 0 || this.creating()) return false;
    for (const risk of this.selectedRisks()) {
      const state = this.riskFieldsMap.get(String(risk['CodRiskProduct']));
      if (!state) continue;
      if (state.loading() || state.form.invalid) return false;
    }
    return true;
  }

  submit(): void {
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      for (const state of this.riskFieldsMap.values()) {
        state.form.markAllAsTouched();
      }
      return;
    }
    const raw = this.form.getRawValue();
    this.creating.set(true);
    this.quoting
      .create({
        codProduct: raw.codProduct,
        codDistributionChannel: raw.codDistributionChannel,
        codDistributionWay: raw.codDistributionWay,
        risks: this.selectedRisks().map((row) => {
          const codRiskProduct = String(row['CodRiskProduct']);
          const state = this.riskFieldsMap.get(codRiskProduct);
          return {
            codRiskProduct,
            riskAttributeValue: state ? state.form.getRawValue() : undefined,
          };
        }),
      })
      .subscribe({
        next: (created) => {
          this.ideQuote = created.IdeQuote;
          this.numQuote = created.NumQuote;
          this.quoting.price(created.IdeQuote).subscribe({
            next: (result) => {
              this.pricing.set(result);
              this.creating.set(false);
              this.step.set('plans');
              this.messages.add({
                severity: 'success',
                summary: this.transloco.translate('common.done'),
                detail: this.transloco.translate('quotes.quoteCreatedDetail', { num: result.numQuote }),
              });
            },
            error: (err: HttpErrorResponse) => {
              this.creating.set(false);
              this.showError(err);
            },
          });
        },
        error: (err: HttpErrorResponse) => {
          this.creating.set(false);
          this.showError(err);
        },
      });
  }

  selectPlan(risk: QuoteRisk, plan: QuotePlan): void {
    if (!this.ideQuote || plan.indSelected) return;
    this.quoting.selectPlan(this.ideQuote, risk.ideQuoteRisk, plan.ideQuoteRiskPlan).subscribe({
      next: (result) => this.pricing.set(result),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  toggleCoverage(plan: QuotePlan, coverage: QuoteCoverage, selected: boolean): void {
    if (!this.ideQuote) return;
    this.quoting.toggleCoverage(this.ideQuote, plan.ideQuoteRiskPlan, coverage.ideQuoteCoverage, selected).subscribe({
      next: (result) => this.pricing.set(result),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  unitLabel(desUnit: string): string {
    if (desUnit === 'Month') return this.transloco.translate('quotes.unitMonth');
    if (desUnit === 'Day') return this.transloco.translate('quotes.unitDay');
    return desUnit.toLowerCase();
  }

  /** Todo riesgo de la cotización tiene un plan elegido -- condición
   * para poder avanzar a "Personas". */
  allRisksHavePlan(): boolean {
    const result = this.pricing();
    if (!result) return false;
    return result.risks.every((risk) => risk.plans.length === 0 || risk.plans.some((plan) => plan.indSelected));
  }

  /** ¿El producto de esta cotización participa de Impacto Social y
   *  todavía no se llenó el formulario? -- si es así, el paso
   *  'socialImpact' va ANTES de 'persons' (ver `continueFromPlans`/
   *  `plansContinueLabel`); si el producto no participa, o ya se
   *  contestó antes (por ejemplo al retomar la cotización, ver
   *  `resumeQuote`), se salta directo a 'persons'. */
  private pendingSocialImpact(): boolean {
    const socialImpact = this.pricing()?.socialImpact;
    return !!socialImpact && socialImpact.active && !socialImpact.answered;
  }

  plansContinueLabel(): string {
    return this.transloco.translate(
      this.pendingSocialImpact() ? 'quotes.continueToSocialImpactButton' : 'quotes.continueToPersonsButton',
    );
  }

  continueFromPlans(): void {
    if (this.pendingSocialImpact()) {
      this.step.set('socialImpact');
      return;
    }
    this.goToPersons();
  }

  goToPersons(): void {
    this.step.set('persons');
    this.refreshPersons();
  }

  /** Vuelve un paso atrás desde 'persons' -- a 'socialImpact' si el
   *  producto participa (se haya contestado o no, para poder revisar el
   *  resultado), o directo a 'plans' si no participa. */
  backFromPersons(): void {
    const socialImpact = this.pricing()?.socialImpact;
    this.step.set(socialImpact?.active ? 'socialImpact' : 'plans');
  }

  backToPlans(): void {
    this.step.set('plans');
  }

  // --- Etapa 2.5: Impacto Social ---

  /** Resultado ya calculado y persistido (`socialImpact.answered ===
   *  true`), o `null` si todavía no se llenó el formulario --
   *  método dedicado (en vez de acceder al campo directo desde el
   *  template) para que TypeScript pueda angostar el tipo unión de
   *  `SocialImpactInfo` sin repetir el chequeo `active && answered` en
   *  cada interpolación del HTML. */
  socialImpactResult(): Extract<QuotePricingResult['socialImpact'], { answered: true }> | null {
    const socialImpact = this.pricing()?.socialImpact;
    return socialImpact && socialImpact.active && socialImpact.answered ? socialImpact : null;
  }

  /** Texto legible del `% pctPrimaAdjustment` -- negativo (el caso
   *  normal hoy, ver los tramos de `SSocialImpactScoring`) es
   *  descuento, positivo sería recargo, `0` sin ajuste. */
  socialImpactAdjustmentText(pct: number): string {
    if (pct < 0) {
      return this.transloco.translate('quotes.socialImpactDiscountDetail', { pct: Math.abs(pct) });
    }
    if (pct > 0) {
      return this.transloco.translate('quotes.socialImpactSurchargeDetail', { pct });
    }
    return this.transloco.translate('quotes.socialImpactNoAdjustmentDetail');
  }

  /** Etiqueta traducida para un `codAdjustment` del Resumen
   *  (`s.appliedAdjustments`, ver `QuotesService.getSummary` ->
   *  `AdjustmentValueResolver.listAppliedAdjustments`) -- mapeo
   *  explícito código -> clave de traducción, no una interpolación
   *  directa del código, para no exponer el identificador técnico en
   *  pantalla. Un futuro `codAdjustment` (fidelidad, multi-póliza) se
   *  agrega acá como un `case` más, mismo criterio que
   *  `PrismaAdjustmentValueResolver` en el backend. `codAdjustment`
   *  desconocido: se muestra tal cual, mejor eso que una pantalla en
   *  blanco si el backend agrega un ajuste nuevo antes que el frontend.
   */
  appliedAdjustmentLabel(codAdjustment: string): string {
    switch (codAdjustment) {
      case 'SOCIAL_IMPACT':
        return this.transloco.translate('quotes.adjustmentLabelSocialImpact');
      default:
        return codAdjustment;
    }
  }

  /** Texto del importe en moneda de un ajuste (`adj.amountPrimaAdjustment`,
   *  ver `QuotesService.getSummary` -- docs/02-roadmap.md, "Importe del
   *  ajuste en el Resumen"): signo explícito antes del símbolo de moneda
   *  (ej. "-€1.95"/"+€1.95"), igual convención que pide el propio roadmap,
   *  distinta de como se interpola `symbolCurrency` en el resto de la
   *  pantalla (ahí siempre son importes positivos). */
  appliedAdjustmentAmountText(symbolCurrency: string, amount: number): string {
    const sign = amount < 0 ? '-' : amount > 0 ? '+' : '';
    return `${sign}${symbolCurrency}${Math.abs(amount)}`;
  }

  submitSocialImpact(): void {
    if (!this.ideQuote || this.socialImpactForm.invalid) {
      this.socialImpactForm.markAllAsTouched();
      return;
    }
    const payload: SubmitSocialImpactAnswersPayload = this.socialImpactForm.getRawValue();
    this.submittingSocialImpact.set(true);
    this.quoting.submitSocialImpactAnswers(this.ideQuote, payload).subscribe({
      next: (result) => {
        this.pricing.set(result);
        this.submittingSocialImpact.set(false);
        const socialImpact = result.socialImpact;
        const detail =
          socialImpact.active && socialImpact.answered
            ? this.socialImpactAdjustmentText(socialImpact.pctPrimaAdjustment)
            : '';
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail,
        });
      },
      error: (err: HttpErrorResponse) => {
        this.submittingSocialImpact.set(false);
        this.showError(err);
      },
    });
  }

  /** El formulario de Impacto Social es opcional de completar ahora
   *  mismo -- `socialImpact` sigue en `{ active: true, answered:
   *  false }` y, al retomar la cotización después (ver
   *  `resumeQuote`), se vuelve a mostrar este paso. */
  skipSocialImpact(): void {
    this.goToPersons();
  }

  // --- Etapa 3: personas ---

  assignedPerson(code: string): QuotePerson | undefined {
    return this.quotePersons().find((row) => row.SPersonRol.CodPersonRol === code);
  }

  /** `TAddress`/teléfono móvil (`MOBILE_PHONE_CONTACT_CLASS`) ya
   * completos para la persona asignada a este rol -- mismo requisito que
   * valida `ContractsService.assertPersonsReadyForIssuance` en el
   * backend antes de generar el contrato (ver docs/02-roadmap.md). */
  personContactComplete(code: string): boolean {
    const assigned = this.assignedPerson(code);
    if (!assigned) return false;
    const hasAddress = assigned.TPerson.TAddress.length > 0;
    const hasMobilePhone = assigned.TPerson.TContactData.some(
      (contact) => contact.SContactClass.CodContactClass === MOBILE_PHONE_CONTACT_CLASS,
    );
    return hasAddress && hasMobilePhone;
  }

  private refreshPersons(resetSlot?: PersonSlot): void {
    if (!this.ideQuote) return;
    this.quoting.listPersons(this.ideQuote).subscribe({
      next: (rows) => {
        this.quotePersons.set(rows);
        if (resetSlot) {
          resetSlot.found.set(null);
          resetSlot.notFound.set(false);
          resetSlot.searchControl.setValue('');
          resetSlot.createForm.reset();
        }
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  searchPerson(slot: PersonSlot): void {
    const numIdentification = (slot.searchControl.value ?? '').trim();
    if (!numIdentification) return;
    slot.searching.set(true);
    slot.notFound.set(false);
    slot.found.set(null);
    this.persons.lookup({ numIdentification }).subscribe({
      next: (person) => {
        slot.searching.set(false);
        slot.found.set(person);
      },
      error: () => {
        slot.searching.set(false);
        slot.notFound.set(true);
        slot.createForm.patchValue({ numIdentification });
      },
    });
  }

  assignFoundPerson(slot: PersonSlot): void {
    const person = slot.found();
    if (!this.ideQuote || !person) return;
    this.quoting.setPerson(this.ideQuote, person.IdePerson, slot.code).subscribe({
      next: () => this.refreshPersons(slot),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  createAndAssignPerson(slot: PersonSlot): void {
    if (!this.ideQuote || slot.createForm.invalid) {
      slot.createForm.markAllAsTouched();
      return;
    }
    const raw = slot.createForm.getRawValue();
    this.persons
      .create({
        desFirstName: raw.desFirstName,
        desLastName1: raw.desLastName1 || undefined,
        desEmail: raw.desEmail,
        numIdentification: raw.numIdentification || undefined,
      })
      .subscribe({
        next: (person) => {
          this.quoting.setPerson(this.ideQuote!, person.IdePerson, slot.code).subscribe({
            next: () => this.refreshPersons(slot),
            error: (err: HttpErrorResponse) => this.showError(err),
          });
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
  }

  copyFromTomador(slot: PersonSlot): void {
    const tomador = this.assignedPerson('TOMADOR');
    if (!tomador || !this.ideQuote) return;
    this.quoting.setPerson(this.ideQuote, tomador.IdePerson, slot.code).subscribe({
      next: () => this.refreshPersons(slot),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  changeAssignment(slot: PersonSlot): void {
    slot.found.set(null);
    slot.notFound.set(false);
  }

  /** Guarda dirección (`POST :id/addresses`) y teléfono móvil
   * (`POST :id/contact-data`, clase `MOBILE_PHONE_CONTACT_CLASS`) para la
   * persona ya asignada a este slot -- ambos en serie porque
   * `party-service` no ofrece un endpoint combinado, y si el primero
   * falla no tiene sentido intentar el segundo. */
  saveContact(slot: PersonSlot): void {
    const assigned = this.assignedPerson(slot.code);
    if (!assigned || slot.contactForm.invalid) {
      slot.contactForm.markAllAsTouched();
      return;
    }
    const raw = slot.contactForm.getRawValue();
    slot.savingContact.set(true);
    this.persons
      .addAddress(assigned.IdePerson, {
        desAddressLine1: raw.desAddressLine1,
        desAddressLine2: raw.desAddressLine2 || undefined,
        codPostal: raw.codPostal,
      })
      .subscribe({
        next: () => {
          this.persons.addMobilePhone(assigned.IdePerson, raw.mobilePhone).subscribe({
            next: () => {
              slot.savingContact.set(false);
              slot.contactForm.reset();
              this.refreshPersons();
            },
            error: (err: HttpErrorResponse) => {
              slot.savingContact.set(false);
              this.showError(err);
            },
          });
        },
        error: (err: HttpErrorResponse) => {
          slot.savingContact.set(false);
          this.showError(err);
        },
      });
  }

  canContinueToSummary(): boolean {
    return (
      !!this.assignedPerson('TOMADOR') &&
      !!this.assignedPerson('TITULAR') &&
      this.personContactComplete('TOMADOR') &&
      this.personContactComplete('TITULAR')
    );
  }

  // --- Etapa 3.5: Requisitos (checklist, Etapa 1 de la feature -- ver
  // docs/02-roadmap.md y el doc-comment de `RequirementsService` en
  // underwriting-service). Auto-gestionado: se muestra solo si el
  // backend resuelve al menos un documento exigido para esta cotización
  // (no depende de `ProcessFlowResolver`/`SProductProcessFlow`, decisión
  // explícita del usuario al acordar el alcance -- Requisitos queda
  // fuera de ese motor de gating por ahora). Informativo/no bloqueante:
  // se puede continuar a "Resumen" sin marcar nada como entregado. ---

  goToSummary(): void {
    if (!this.ideQuote) return;
    const ideQuote = this.ideQuote;
    this.loadingRequirements.set(true);
    this.quoting.listRequirements(ideQuote).subscribe({
      next: (rows) => {
        this.loadingRequirements.set(false);
        this.requirementRows.set(rows);
        if (rows.length > 0) {
          this.step.set('requirements');
        } else {
          this.loadSummaryAndShow();
        }
      },
      error: () => {
        this.loadingRequirements.set(false);
        // Si el checklist no se pudo resolver, no bloquea el flujo --
        // sigue directo a Resumen (Etapa 1 es informativa, no crítica).
        this.loadSummaryAndShow();
      },
    });
  }

  private loadSummaryAndShow(): void {
    if (!this.ideQuote) return;
    this.quoting.getSummary(this.ideQuote).subscribe({
      next: (result) => {
        this.summary.set(result);
        this.step.set('summary');
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  continueFromRequirements(): void {
    this.loadSummaryAndShow();
  }

  backFromRequirements(): void {
    this.step.set('persons');
  }

  toggleRequirementDelivered(row: QuoteRequirementRow): void {
    if (!this.ideQuote) return;
    const nextDelivered = !row.Data?.indDelivered;
    this.quoting.setRequirementDelivered(this.ideQuote, row.IdeQuoteRequirement, nextDelivered).subscribe({
      next: (updated) => {
        this.requirementRows.set(this.requirementRows().map((r) => (r.IdeQuoteRequirement === updated.IdeQuoteRequirement ? updated : r)));
      },
      error: () => {
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('requirements.wizardStep.updateErrorDetail'),
        });
      },
    });
  }

  backToPersons(): void {
    this.step.set(this.requirementRows().length > 0 ? 'requirements' : 'persons');
  }

  // --- Etapa 5: aceptar / contratar ---

  goToContractStep(): void {
    this.step.set('contract');
  }

  backToSummary(): void {
    this.step.set('summary');
  }

  acceptQuote(): void {
    if (!this.ideQuote) return;
    this.accepting.set(true);
    this.quoting.acceptQuote(this.ideQuote).subscribe({
      next: () => {
        this.accepting.set(false);
        this.quoteAccepted.set(true);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('quotes.quoteAcceptedDetail'),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.accepting.set(false);
        this.showError(err);
      },
    });
  }

  /** Navega a la pantalla de detalle de contrato (`/contratos/:id`) --
   *  el `p-tag` "Contrato <N>" pasa a ser un link real, pedido explícito
   *  del usuario el 22/09/2026 (ver docs/02-roadmap.md). */
  verContrato(ideContract: string): void {
    this.router.navigate(['/contratos', ideContract]);
  }

  generateContract(): void {
    if (!this.ideQuote) return;
    this.contracting.set(true);
    this.quoting.createContract(this.ideQuote).subscribe({
      next: (result) => {
        this.contracting.set(false);
        this.contractResult.set(result);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('quotes.contractGeneratedSummary'),
          detail: this.transloco.translate('quotes.contractGeneratedDetail', { num: result.NumContract }),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.contracting.set(false);
        this.showError(err);
      },
    });
  }

  /**
   * Retoma una cotización existente abierta desde el listado
   * (`/cotizacion/:id`, ver `QuotesListComponent`) -- deliberadamente
   * NO reconstruye la Etapa 1 (riesgos/atributos elegidos originalmente,
   * ver docs/02-roadmap.md, decisión explícita del usuario: "ver
   * resumen + continuar el flujo", no edición completa). Usa
   * `GET /quotes/:id` (mismo `buildPricingResult` que ya alimenta el
   * paso 'plans', ahora también con `codState`/`contract`, ver
   * `QuotingService.getQuote`) para decidir a qué paso saltar:
   *
   * - Ya tiene contrato generado -> paso 'contract', con
   *   `quoteAccepted`/`contractResult` ya en true/informados -- la
   *   MISMA vista de "éxito" que ya se muestra justo después de generar
   *   un contrato (ver `quotes.component.html`), sin necesidad de una
   *   vista de solo lectura aparte.
   * - Estado "Aceptado" (sin contrato todavía) -> paso 'contract',
   *   listo para generar el contrato.
   * - Si el producto participa de Impacto Social y todavía no se
   *   contestó el formulario (Fase 3 Etapa 2, ver docs/02-roadmap.md)
   *   -> paso 'socialImpact', antes de mirar personas siquiera --
   *   mismo criterio que `continueFromPlans`/`pendingSocialImpact`.
   * - Si no, sigue en Borrador -> se consultan las personas ya
   *   asociadas (`listPersons`) y, con el mismo criterio que ya usa
   *   `canContinueToSummary()`, se salta a 'summary' si Tomador/Titular
   *   ya están completos, o a 'persons' si todavía falta alguno.
   */
  private resumeQuote(ideQuote: string): void {
    this.ideQuote = ideQuote;
    this.quoting.getQuote(ideQuote).subscribe({
      next: (result) => {
        this.numQuote = result.numQuote;
        this.pricing.set(result);

        if (result.contract) {
          this.quoteAccepted.set(true);
          this.contractResult.set({
            IdeContract: result.contract.ideContract,
            NumContract: result.contract.numContract,
          });
          this.step.set('contract');
          return;
        }
        if (result.codState === 'ACEPTADO') {
          this.quoteAccepted.set(true);
          this.step.set('contract');
          return;
        }
        if (result.socialImpact.active && !result.socialImpact.answered) {
          this.step.set('socialImpact');
          return;
        }

        this.quoting.listPersons(ideQuote).subscribe({
          next: (rows) => {
            this.quotePersons.set(rows);
            if (this.canContinueToSummary()) {
              this.goToSummary();
            } else {
              this.step.set('persons');
            }
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  /** Navega a `/cotizacion/nueva` -- separado de `nuevaCotizacion()`
   *  (que solo resetea el estado local) porque ese reset ya lo dispara
   *  la suscripción a `route.paramMap` del constructor cuando cambia la
   *  URL; este método es el que usa el botón "Nueva cotización". */
  irANueva(): void {
    this.router.navigateByUrl('/cotizacion/nueva');
  }

  /** Vuelve al listado (`/cotizacion`). */
  volverAlListado(): void {
    this.router.navigateByUrl('/cotizacion');
  }

  nuevaCotizacion(): void {
    this.ideQuote = null;
    this.numQuote = null;
    this.pricing.set(null);
    this.summary.set(null);
    this.quotePersons.set([]);
    this.socialImpactForm.reset({
      carKmPerYear: 0,
      carFuelType: '',
      electricityKwhMonth: 0,
      flightsPerYear: 0,
      volunteerHoursPerYear: 0,
      recurringCause: false,
      regularDonations: false,
    });
    this.submittingSocialImpact.set(false);
    this.quoteAccepted.set(false);
    this.contractResult.set(null);
    this.accepting.set(false);
    this.contracting.set(false);
    for (const slot of this.personSlots) {
      slot.found.set(null);
      slot.notFound.set(false);
      slot.searching.set(false);
      slot.searchControl.setValue('');
      slot.createForm.reset();
      slot.contactForm.reset();
      slot.savingContact.set(false);
    }
    this.selectedRisks.set([]);
    this.riskFieldsMap.clear();
    this.riskToAddControl.setValue(null);
    this.form.reset();
    this.step.set('form');
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
