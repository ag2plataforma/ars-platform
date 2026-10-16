import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Observable, concat, forkJoin, last, of, shareReplay } from 'rxjs';
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
import {
  ExtractionTarget,
  RequirementExtractionDialogComponent,
  StoredExtraction,
  storedExtractionOf,
} from '../requirements/requirement-extraction-dialog.component';
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
import { downloadBlob } from '../../core/files/file.util';
import { DocumentTemplatesService } from '../documents/document-templates.service';
import { PaymentFractionPickerComponent } from './payment-fraction-picker.component';
import {
  InsuredPersonConfig,
  InsuredPersonField,
  resolveInsuredPersonConfig,
} from '../products/insured-person-fields';
import {
  ProcessFlowResolution,
  RiskAttributeField,
  RiskAttributeSchema,
  RiskAttributesService,
  STEP_CODE_CUSTOM_ATTRIBUTES,
} from './risk-attributes.service';

const PRODUCTS_PATH = '/product-rating/products';
const DISTRIBUTION_CHANNELS_PATH = '/party/distribution-channels';
const DISTRIBUTION_WAYS_PATH = '/party/distribution-ways';
const RISK_PRODUCTS_PATH = '/product-rating/risk-products';
const IDENTIFICATION_TYPES_PATH = '/reference-data/identification-types';
const GENDERS_PATH = '/reference-data/genders';
const MARITAL_STATUSES_PATH = '/reference-data/marital-statuses';
const PROFESSIONS_PATH = '/reference-data/professions';

type QuoteStep = 'form' | 'plans' | 'adjustments' | 'socialImpact' | 'persons' | 'requirements' | 'summary' | 'contract';

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

/** Un riesgo agregado a la cotizacion. En productos multirriesgo puede haber varios del mismo tipo
 * (ej. 4 viajeros), por eso se identifica con `key` y no con `CodRiskProduct`. */
interface RiskEntry {
  key: string;
  row: CatalogRow;
}

/** Tope de riesgos por cotizacion (evita un tipeo accidental de "500"). */
const MAX_RISKS = 20;

/** Un plan visto "en comun" para todos los riesgos de una cotizacion multirriesgo: mismo plan para todos,
 * cada riesgo se tarifa por separado y el total es la suma. */
export interface CommonPlanCoverage {
  desShortCoverage: string | null;
  prime: number;
  indSelected: boolean;
  parts: Array<{ plan: QuotePlan; coverage: QuoteCoverage }>;
}

export interface CommonPlan {
  codPlanProduct: string;
  desShortPlan: string | null;
  desLargePlan: string | null;
  unitDesUnit: string;
  total: number;
  indSelected: boolean;
  perRisk: Array<{ numRisk: number; desRisk: string; basePrice: number; plan: QuotePlan; risk: QuoteRisk }>;
  mandatory: CommonPlanCoverage[];
  optional: CommonPlanCoverage[];
}

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
 * eso ya NO es así: existen `SEntity`/`SStateRule` reales. Historia: nacieron
 * del fixture de prueba con estados `SEED_*`; el 2026-10-03 se normalizaron
 * a los estados reales del legado (`normalize-state-machine.js`).
 * `SState`/`SStateRule`/`SEntity` NO están particionados por producto
 * (no hay `IdeProduct` en `SStateRule`): es una máquina de estados
 * GLOBAL, así que alcanza para que "Aceptar cotización"/"Generar
 * contrato" funcionen contra CUALQUIER producto.
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
    RequirementExtractionDialogComponent,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    RadioButtonModule,
    SelectModule,
    TagModule,
    ToastModule,
    TranslocoPipe,
    PaymentFractionPickerComponent,
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
  private readonly documentTemplates = inject(DocumentTemplatesService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly products = signal<CatalogRow[]>([]);
  readonly distributionChannels = signal<CatalogRow[]>([]);
  readonly distributionWays = signal<CatalogRow[]>([]);
  readonly riskProductOptions = signal<CatalogRow[]>([]);
  readonly selectedRisks = signal<RiskEntry[]>([]);
  private nextRiskKey = 0;

  /** `CodProduct` elegido (como signal para que `isMultiRisk` reaccione). */
  readonly selectedProductCode = signal('');
  /** El producto elegido admite N riesgos por cotizacion (`SProduct.IndMultiRisk`). */
  readonly isMultiRisk = computed(() => {
    const cod = this.selectedProductCode();
    return !!this.products().find((p) => p['CodProduct'] === cod)?.['IndMultiRisk'];
  });
  readonly maxRisks = MAX_RISKS;

  readonly creating = signal(false);
  readonly pricing = signal<QuotePricingResult | null>(null);
  readonly step = signal<QuoteStep>('form');
  private ideQuote: string | null = null;

  /** `ideQuote` para el template (el campo es privado). */
  get currentIdeQuote(): string | null {
    return this.ideQuote;
  }
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
  /** `CodPaymentFraction` elegido en el selector de forma de pago (vacío =
   *  todavía sin cargar; el selector deja la de por defecto al abrirse). */
  readonly paymentFraction = signal('');

  /** Todos los `SRiskProduct` (de cualquier producto), cacheados una
   * sola vez -- se filtran client-side por el producto elegido, mismo
   * criterio que ya usa `RiskProductsTabComponent` (el backend no
   * expone ese filtro en el `GET` de lista). */
  private allRiskProducts: CatalogRow[] = [];

  /** Campos personalizados por riesgo agregado (Etapa 1), indexado por
   * `CodRiskProduct` -- ver `buildRiskFieldsState`. */
  private readonly riskFieldsMap = new Map<string, RiskFieldsState>();

  /** Campos de NIVEL PRODUCTO que se piden al cotizar (etapa PRICING): comunes a todos los riesgos. */
  readonly productFields = buildRiskFieldsState(this.fb, '__producto__');
  private productFieldsLoadToken = 0;
  /** Config (schema + flujo) por tipo de riesgo, cacheada para no repetir la consulta por cada riesgo igual. */
  private readonly riskConfigCache = new Map<string, Observable<{ schema: RiskAttributeSchema; flow: ProcessFlowResolution | null }>>();

  form = this.fb.nonNullable.group({
    codProduct: ['', Validators.required],
    codDistributionChannel: ['', Validators.required],
    codDistributionWay: ['', Validators.required],
  });

  riskToAddControl = this.fb.control<string | null>(null);
  riskQuantityControl = this.fb.nonNullable.control(1, [Validators.min(1), Validators.max(MAX_RISKS)]);

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
    // Los campos del producto dependen del flujo (canal/via): se recargan si cambian.
    this.form.controls.codDistributionChannel.valueChanges.subscribe(() => this.reloadProductFieldsIfProduct());
    this.form.controls.codDistributionWay.valueChanges.subscribe(() => this.reloadProductFieldsIfProduct());

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
    this.clearRisks();
    this.riskToAddControl.setValue(null);
    this.riskQuantityControl.setValue(1);
    this.selectedProductCode.set(this.form.controls.codProduct.value);
    this.refreshRiskProductOptions();
    this.loadProductFields();
  }

  private clearRisks(): void {
    this.selectedRisks.set([]);
    this.riskFieldsMap.clear();
  }

  private reloadProductFieldsIfProduct(): void {
    if (this.form.controls.codProduct.value) this.loadProductFields();
  }

  /** Vacia los campos de producto (sin producto elegido o al empezar una cotizacion nueva). */
  private clearProductFields(): void {
    this.productFieldsLoadToken++;
    for (const key of Object.keys(this.productFields.form.controls)) this.productFields.form.removeControl(key);
    this.productFields.fields.set([]);
    this.productFields.loading.set(false);
  }

  /**
   * Trae los campos de NIVEL PRODUCTO (etapa PRICING) del producto elegido y arma su formulario. Si ya
   * habia valores cargados y el campo sigue existiendo, se conservan (el usuario puede estar cambiando
   * canal/via con el formulario a medio llenar).
   */
  private loadProductFields(): void {
    const previous = this.productFields.form.getRawValue() as Record<string, unknown>;
    this.clearProductFields();
    const codProduct = this.form.controls.codProduct.value;
    const product = this.products().find((p) => p['CodProduct'] === codProduct);
    if (!product) return;
    const token = this.productFieldsLoadToken;
    this.productFields.loading.set(true);
    const codDistributionChannel = this.form.controls.codDistributionChannel.value;
    const codDistributionWay = this.form.controls.codDistributionWay.value;
    const flow$ = codDistributionChannel
      ? this.riskAttributes.resolveActiveSteps({
          codProduct,
          codDistributionChannel,
          codDistributionWay: codDistributionWay || undefined,
        })
      : of(null);
    forkJoin({ schema: this.riskAttributes.getSchema(String(product['IdeProduct']), 'PRICING'), flow: flow$ }).subscribe({
      next: ({ schema, flow }) => {
        if (token !== this.productFieldsLoadToken) return; // llego tarde: el producto ya cambio
        const stepActive = !flow || flow.codProcessFlow === null || flow.activeSteps.includes(STEP_CODE_CUSTOM_ATTRIBUTES);
        const fields = stepActive ? schema.fields : [];
        for (const field of fields) {
          const initialValue = previous[field.ideAttributeProperty] ?? (field.type === 'checkbox' ? false : null);
          this.productFields.form.addControl(
            field.ideAttributeProperty,
            this.fb.control(initialValue, buildValidators(field.validators)),
          );
        }
        this.productFields.fields.set(fields);
        this.productFields.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (token !== this.productFieldsLoadToken) return;
        this.productFields.loading.set(false);
        this.showError(err);
      },
    });
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
    const row = this.riskProductOptions().find((r) => r['CodRiskProduct'] === codRiskProduct);
    if (!row) return;
    if (!this.isMultiRisk()) {
      // Producto de un solo riesgo: elegir otro tipo reemplaza al anterior.
      this.clearRisks();
      this.pushRisk(row);
    } else {
      const quantity = Math.max(1, Math.min(MAX_RISKS, Math.trunc(Number(this.riskQuantityControl.value)) || 1));
      const room = MAX_RISKS - this.selectedRisks().length;
      for (let i = 0; i < Math.min(quantity, room); i++) this.pushRisk(row);
    }
    this.riskToAddControl.setValue(null);
    this.riskQuantityControl.setValue(1);
  }

  private pushRisk(row: CatalogRow): void {
    const entry: RiskEntry = { key: `risk-${++this.nextRiskKey}`, row };
    this.selectedRisks.update((current) => [...current, entry]);
    this.loadRiskFields(entry);
  }

  removeRisk(key: string): void {
    this.selectedRisks.update((current) => current.filter((entry) => entry.key !== key));
    this.riskFieldsMap.delete(key);
  }

  /** Numero del riesgo entre los de su mismo tipo ("Viaje 2"); solo se muestra en multirriesgo. */
  riskNumber(entry: RiskEntry): number {
    let n = 0;
    for (const current of this.selectedRisks()) {
      if (current.row['CodRiskProduct'] === entry.row['CodRiskProduct']) n++;
      if (current === entry) return n;
    }
    return n;
  }

  /** Trae el schema de campos personalizados del riesgo recién agregado
   * (`RiskAttributesService`, ver su comentario) y arma su `FormGroup`
   * dinámico -- un control por `IdeAttributeProperty`, con los
   * validadores que declare cada campo. Un riesgo sin motor de
   * atributos configurado (`fields: []`) simplemente no pinta nada y no
   * bloquea "Cotizar". Solo los campos de etapa PRICING (los de
   * CONTRACT se piden recien al contratar). */
  private loadRiskFields(entry: RiskEntry): void {
    const codRiskProduct = String(entry.row['CodRiskProduct']);
    const ideRiskProduct = String(entry.row['IdeRiskProduct']);
    const state = buildRiskFieldsState(this.fb, codRiskProduct);
    this.riskFieldsMap.set(entry.key, state);

    // Ademas del schema (¿tiene este riesgo campos personalizados
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
    const cacheKey = `${ideRiskProduct}|${codDistributionChannel}|${codDistributionWay}`;
    let config$ = this.riskConfigCache.get(cacheKey);
    if (!config$) {
      const activeSteps$ =
        codProduct && codDistributionChannel
          ? this.riskAttributes.resolveActiveSteps({
              codProduct,
              codDistributionChannel,
              codRiskProduct,
              codDistributionWay: codDistributionWay || undefined,
            })
          : of(null);
      config$ = forkJoin({ schema: this.riskAttributes.getSchema(ideRiskProduct, 'PRICING'), flow: activeSteps$ }).pipe(
        shareReplay(1),
      );
      this.riskConfigCache.set(cacheKey, config$);
    }

    config$.subscribe({
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
        this.riskConfigCache.delete(cacheKey);
        state.loading.set(false);
        this.showError(err);
      },
    });
  }

  /** Estado de campos personalizados de un riesgo ya agregado, para el
   * template (`@for` sobre `selectedRisks()`). */
  customFieldsFor(key: string): RiskFieldsState | undefined {
    return this.riskFieldsMap.get(key);
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
    if (this.productFields.loading() || this.productFields.form.invalid) return false;
    for (const risk of this.selectedRisks()) {
      const state = this.riskFieldsMap.get(risk.key);
      if (!state) continue;
      if (state.loading() || state.form.invalid) return false;
    }
    return true;
  }

  submit(): void {
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      this.productFields.form.markAllAsTouched();
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
        genericAttributeValue:
          this.productFields.fields().length > 0 ? this.productFields.form.getRawValue() : undefined,
        risks: this.selectedRisks().map((entry) => {
          const codRiskProduct = String(entry.row['CodRiskProduct']);
          const state = this.riskFieldsMap.get(entry.key);
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

  /** Planes con el desglose de cálculo desplegado (`ideQuoteRiskPlan`). */
  readonly openBreakdowns = signal<ReadonlySet<string>>(new Set());

  toggleBreakdown(ideQuoteRiskPlan: string): void {
    this.openBreakdowns.update((current) => {
      const next = new Set(current);
      if (!next.delete(ideQuoteRiskPlan)) next.add(ideQuoteRiskPlan);
      return next;
    });
  }

  /** Solo las coberturas seleccionadas con algún concepto calculado. */
  breakdownCoverages(plan: QuotePlan): QuoteCoverage[] {
    return [...plan.mandatoryCoverages, ...plan.optionalCoverages].filter((c) => c.indSelected && c.concepts.length > 0);
  }

  /** Cotizacion con mas de un riesgo: un solo plan para todos (cada riesgo se tarifa aparte y se suma). */
  readonly commonPlanMode = computed(() => (this.pricing()?.risks.length ?? 0) > 1);

  readonly commonPlans = computed<CommonPlan[]>(() => {
    const risks = this.pricing()?.risks ?? [];
    if (risks.length < 2) return [];
    const result: CommonPlan[] = [];
    for (const first of risks[0].plans) {
      const perRisk: CommonPlan['perRisk'] = [];
      for (const risk of risks) {
        const plan = risk.plans.find((p) => p.codPlanProduct === first.codPlanProduct);
        if (plan) perRisk.push({ numRisk: risk.numRisk, desRisk: risk.desRisk, basePrice: plan.basePrice, plan, risk });
      }
      if (perRisk.length !== risks.length) continue; // el plan no existe para todos los riesgos
      const aggregate = (pick: (plan: QuotePlan) => QuoteCoverage[]): CommonPlanCoverage[] => {
        const byName = new Map<string, CommonPlanCoverage>();
        for (const { plan } of perRisk) {
          for (const coverage of pick(plan)) {
            const name: string = coverage.desShortCoverage ?? String(this.transloco.translate('quotes.coverageFallback'));
            const entry = byName.get(name) ?? { desShortCoverage: name, prime: 0, indSelected: true, parts: [] };
            entry.prime += Number(coverage.prime);
            entry.indSelected = entry.indSelected && coverage.indSelected;
            entry.parts.push({ plan, coverage });
            byName.set(name, entry);
          }
        }
        return [...byName.values()];
      };
      result.push({
        codPlanProduct: first.codPlanProduct,
        desShortPlan: first.desShortPlan,
        desLargePlan: first.desLargePlan,
        unitDesUnit: first.unit.desUnit,
        total: perRisk.reduce((sum, p) => sum + Number(p.basePrice), 0),
        indSelected: perRisk.every((p) => p.plan.indSelected),
        perRisk,
        mandatory: aggregate((plan) => plan.mandatoryCoverages),
        optional: aggregate((plan) => plan.optionalCoverages),
      });
    }
    return result;
  });

  /** Elige el mismo plan para todos los riesgos (una llamada por riesgo, en orden). */
  selectCommonPlan(commonPlan: CommonPlan): void {
    const ideQuote = this.ideQuote;
    if (!ideQuote || commonPlan.indSelected) return;
    const calls = commonPlan.perRisk
      .filter((p) => !p.plan.indSelected)
      .map((p) => this.quoting.selectPlan(ideQuote, p.risk.ideQuoteRisk, p.plan.ideQuoteRiskPlan));
    concat(...calls)
      .pipe(last())
      .subscribe({
        next: (result) => this.pricing.set(result),
        error: (err: HttpErrorResponse) => this.showError(err),
      });
  }

  /** Marca/desmarca una cobertura opcional en todos los riesgos del plan comun. */
  toggleCommonCoverage(coverage: CommonPlanCoverage, selected: boolean): void {
    const ideQuote = this.ideQuote;
    if (!ideQuote) return;
    const calls = coverage.parts
      .filter((part) => part.coverage.indSelected !== selected)
      .map((part) => this.quoting.toggleCoverage(ideQuote, part.plan.ideQuoteRiskPlan, part.coverage.ideQuoteCoverage, selected));
    if (calls.length === 0) return;
    concat(...calls)
      .pipe(last())
      .subscribe({
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

  /** ¿Hay algún recargo/descuento "Manual" Activo en el catálogo? (Fase
   *  2 backlog ítem 7, ver docs/02-roadmap.md) -- a diferencia de
   *  Impacto Social, no depende del producto de esta cotización en
   *  particular. Si no hay ninguno dado de alta todavía, el paso
   *  'adjustments' se salta por completo (mismo criterio que Impacto
   *  Social cuando el producto no participa). */
  hasGenericAdjustments(): boolean {
    return (this.pricing()?.genericAdjustments.length ?? 0) > 0;
  }

  plansContinueLabel(): string {
    if (this.hasGenericAdjustments()) {
      return this.transloco.translate('quotes.continueToAdjustmentsButton');
    }
    return this.transloco.translate(
      this.pendingSocialImpact() ? 'quotes.continueToSocialImpactButton' : 'quotes.continueToPersonsButton',
    );
  }

  continueFromPlans(): void {
    if (this.hasGenericAdjustments()) {
      this.selectedAdjustmentIds.set(
        new Set(this.pricing()!.genericAdjustments.filter((a) => a.applied).map((a) => a.ideAdjustment)),
      );
      this.step.set('adjustments');
      return;
    }
    this.continueFromAdjustments();
  }

  // --- Etapa 2.4: Recargos y descuentos (Fase 2 backlog ítem 7) ---

  readonly selectedAdjustmentIds = signal<Set<string>>(new Set());

  isAdjustmentSelected(ideAdjustment: string): boolean {
    return this.selectedAdjustmentIds().has(ideAdjustment);
  }

  toggleAdjustment(ideAdjustment: string): void {
    const next = new Set(this.selectedAdjustmentIds());
    if (next.has(ideAdjustment)) {
      next.delete(ideAdjustment);
    } else {
      next.add(ideAdjustment);
    }
    this.selectedAdjustmentIds.set(next);
  }

  readonly savingAdjustments = signal(false);

  /** Label del botón "Continuar" DENTRO del paso 'adjustments' --
   *  `plansContinueLabel()` no sirve acá porque siempre devolvería
   *  "Continuar a Recargos y descuentos" (ya estando en ese paso). */
  adjustmentsContinueLabel(): string {
    return this.transloco.translate(
      this.pendingSocialImpact() ? 'quotes.continueToSocialImpactButton' : 'quotes.continueToPersonsButton',
    );
  }

  /** Guarda la selección (puede ser vacía -- el operador puede no
   *  aplicar ninguno) y continúa con la misma lógica que antes tenía
   *  `continueFromPlans` directamente: 'socialImpact' si pendiente, si
   *  no 'persons'. */
  continueFromAdjustments(): void {
    if (!this.ideQuote) return;
    this.savingAdjustments.set(true);
    this.quoting.setAdjustments(this.ideQuote, [...this.selectedAdjustmentIds()]).subscribe({
      next: (result) => {
        this.pricing.set(result);
        this.savingAdjustments.set(false);
        if (this.pendingSocialImpact()) {
          this.step.set('socialImpact');
          return;
        }
        this.goToPersons();
      },
      error: (err: HttpErrorResponse) => {
        this.savingAdjustments.set(false);
        this.showError(err);
      },
    });
  }

  backFromAdjustments(): void {
    this.step.set('plans');
  }

  goToPersons(): void {
    this.step.set('persons');
    this.refreshPersons();
  }

  /** Vuelve un paso atrás desde 'persons' -- a 'socialImpact' si el
   *  producto participa (se haya contestado o no, para poder revisar el
   *  resultado), a 'adjustments' si hay catálogo pero el producto no
   *  participa de Impacto Social, o directo a 'plans' si ninguno aplica. */
  backFromPersons(): void {
    const socialImpact = this.pricing()?.socialImpact;
    if (socialImpact?.active) {
      this.step.set('socialImpact');
      return;
    }
    this.step.set(this.hasGenericAdjustments() ? 'adjustments' : 'plans');
  }

  /** Botón "atrás" del paso 'socialImpact' -- a 'adjustments' si hay
   *  catálogo (antes de 'socialImpact' en el flujo, ver
   *  `continueFromPlans`), si no directo a 'plans'. */
  backToPlans(): void {
    this.step.set(this.hasGenericAdjustments() ? 'adjustments' : 'plans');
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

  /** Etiqueta traducida para un ajuste del Resumen (`s.appliedAdjustments`,
   *  ver `QuotesService.getSummary` -> `AdjustmentValueResolver.listAppliedAdjustments`).
   *  `'SOCIAL_IMPACT'` sigue con su propia clave de traducción fija (no
   *  tiene un catálogo con nombre propio); cualquier otro ajuste (Fase 2
   *  backlog ítem 7 -- fidelidad, multi-póliza, etc.) ya trae su nombre
   *  legible desde el catálogo genérico `SAdjustment` (`desAdjustment`),
   *  sin necesitar un `case` nuevo acá por cada uno -- el código crudo es
   *  solo el último recurso si no vino. */
  appliedAdjustmentLabel(adj: { codAdjustment: string; desAdjustment?: string }): string {
    switch (adj.codAdjustment) {
      case 'SOCIAL_IMPACT':
        return this.transloco.translate('quotes.adjustmentLabelSocialImpact');
      default:
        // Recargos/descuentos genéricos (Fase 2 backlog ítem 7, ver
        // docs/02-roadmap.md) ya traen su propio nombre legible
        // (`SAdjustment.DesAdjustment`) -- el código crudo queda solo
        // como último recurso si por algún motivo no vino.
        return adj.desAdjustment ?? adj.codAdjustment;
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

  /** Subida real de archivo (Etapa 2, ver docs/02-roadmap.md ítem 4) --
   *  reemplaza al toggle manual "Entregado" de la Etapa 1: un documento
   *  real adjunto ES la entrega. */
  onRequirementFileSelected(row: QuoteRequirementRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.ideQuote) return;
    this.quoting.uploadRequirementFile(this.ideQuote, row.IdeQuoteRequirement, file).then(
      (updated) => {
        this.requirementRows.set(this.requirementRows().map((r) => (r.IdeQuoteRequirement === updated.IdeQuoteRequirement ? updated : r)));
      },
      () => {
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('requirements.wizardStep.updateErrorDetail'),
        });
      },
    );
  }

  // --- Extracción de datos del documento con IA (Fase 4) ---

  readonly extractionTarget = signal<ExtractionTarget | null>(null);

  hasExtraction(row: QuoteRequirementRow): boolean {
    return storedExtractionOf(row.Data) !== null;
  }

  openExtraction(row: QuoteRequirementRow, viewStored: boolean): void {
    if (!this.ideQuote) return;
    this.extractionTarget.set({
      kind: 'QUOTE',
      id: row.IdeQuoteRequirement,
      ideQuote: this.ideQuote,
      name: row.SProductRequirement.DesShort ?? row.SProductRequirement.SRequirement.DesRequirement,
      stored: viewStored ? storedExtractionOf(row.Data) : null,
    });
  }

  onExtractionSaved(extraction: StoredExtraction | null): void {
    const target = this.extractionTarget();
    this.extractionTarget.set(null);
    if (!target) return;
    this.requirementRows.set(
      this.requirementRows().map((r) => {
        if (r.IdeQuoteRequirement !== target.id) return r;
        const data = { ...(r.Data ?? {}) } as Record<string, unknown>;
        if (extraction) data['extraction'] = extraction;
        else delete data['extraction'];
        return { ...r, Data: data as QuoteRequirementRow['Data'] };
      }),
    );
    this.messages.add({
      severity: 'success',
      summary: this.transloco.translate('common.done'),
      detail: this.transloco.translate('requirements.extraction.savedDetail'),
    });
  }

  downloadRequirementFile(row: QuoteRequirementRow): void {
    if (!this.ideQuote || !row.DesFileName) return;
    const fileName = row.DesFileName;
    this.quoting.downloadRequirementFile(this.ideQuote, row.IdeQuoteRequirement).subscribe({
      next: (blob) => downloadBlob(blob, fileName),
      error: () => {
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('requirements.wizardStep.updateErrorDetail'),
        });
      },
    });
  }

  readonly downloadingQuotePdf = signal(false);

  /** "Descargar cotización en PDF" -- se genera al vuelo con la plantilla
   *  COTIZACION del producto (rol Tomador), sin guardar nada. */
  downloadQuotePdf(): void {
    if (!this.ideQuote) return;
    const ideQuote = this.ideQuote;
    this.downloadingQuotePdf.set(true);
    this.documentTemplates.listPersonRoles().subscribe({
      next: (roles) => {
        const tomador = roles.find((r) => r.codPersonRol === 'TOMADOR');
        if (!tomador) {
          this.downloadingQuotePdf.set(false);
          this.messages.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('quotes.quotePdfNoTomadorRole'),
          });
          return;
        }
        this.documentTemplates.downloadQuotePdf(ideQuote, tomador.idePersonRol).subscribe({
          next: (blob) => {
            this.downloadingQuotePdf.set(false);
            downloadBlob(blob, 'cotizacion.pdf');
          },
          error: (err: HttpErrorResponse) => {
            this.downloadingQuotePdf.set(false);
            this.showBlobError(err);
          },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.downloadingQuotePdf.set(false);
        this.showError(err);
      },
    });
  }

  /** Con `responseType: 'blob'` el cuerpo del error también llega como
   *  Blob -- hay que leerlo para mostrar el mensaje real del backend
   *  (ej. "No hay una plantilla configurada de tipo COTIZACION..."). */
  private showBlobError(err: HttpErrorResponse): void {
    const body = err.error;
    if (body instanceof Blob) {
      body.text().then((text) => {
        let detail = this.transloco.translate<string>('common.unexpectedError');
        try {
          const parsed = JSON.parse(text) as { message?: unknown };
          if (parsed.message) detail = String(parsed.message);
        } catch {
          // cuerpo no-JSON -- queda el mensaje genérico
        }
        this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
      });
      return;
    }
    this.showError(err);
  }

  backToPersons(): void {
    this.step.set(this.requirementRows().length > 0 ? 'requirements' : 'persons');
  }

  // --- Etapa 5: aceptar / contratar ---

  goToContractStep(): void {
    this.step.set('contract');
    this.loadContractFields();
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

  /** Campos de nivel producto de etapa CONTRACT: se piden recien al contratar. */
  readonly contractFields = buildRiskFieldsState(this.fb, '__contrato__');

  /** Campos de RIESGO de etapa CONTRACT, por riesgo de la cotizacion (solo los que tienen alguno). */
  readonly contractRiskFields = signal<Array<{ risk: QuoteRisk; state: RiskFieldsState }>>([]);

  /** Asegurados de los riesgos de tipo persona (`SRisk.IndPersonRisk`): datos minimos que pide el producto. */
  readonly insuredPersons = signal<Array<{ risk: QuoteRisk; form: FormGroup }>>([]);
  readonly insuredConfig = signal<InsuredPersonConfig>(resolveInsuredPersonConfig(null));
  readonly identificationTypes = signal<CatalogRow[]>([]);
  readonly genders = signal<CatalogRow[]>([]);
  readonly maritalStatuses = signal<CatalogRow[]>([]);
  readonly professions = signal<CatalogRow[]>([]);
  private insuredCatalogsLoaded = false;
  readonly insuredSearching = signal<string | null>(null);

  /** `true` si el producto pide ese dato del asegurado (OPCIONAL u OBLIGATORIO). */
  insuredAsks(field: InsuredPersonField): boolean {
    return this.insuredConfig()[field] !== 'NONE';
  }

  insuredRequired(field: InsuredPersonField): boolean {
    return this.insuredConfig()[field] === 'REQUIRED';
  }

  private isPersonRisk(ideRiskProduct: string): boolean {
    const row = this.allRiskProducts.find((r) => r['IdeRiskProduct'] === ideRiskProduct);
    const risk = row?.['SRisk'] as Record<string, unknown> | undefined;
    return risk?.['IndPersonRisk'] === true;
  }

  private buildInsuredForm(config: InsuredPersonConfig): FormGroup {
    const req = (field: InsuredPersonField): ValidatorFn[] => (config[field] === 'REQUIRED' ? [Validators.required] : []);
    const group = this.fb.group({});
    const add = (name: string, validators: ValidatorFn[] = []) => group.addControl(name, this.fb.control('', validators));
    add('desFirstName', [Validators.required, Validators.maxLength(30)]);
    if (config.middleName !== 'NONE') add('desMiddleName', [...req('middleName'), Validators.maxLength(30)]);
    if (config.lastName1 !== 'NONE') add('desLastName1', [...req('lastName1'), Validators.maxLength(30)]);
    if (config.lastName2 !== 'NONE') add('desLastName2', [...req('lastName2'), Validators.maxLength(30)]);
    if (config.document !== 'NONE') {
      add('ideIdentificationType', req('document'));
      add('numIdentification', [...req('document'), Validators.maxLength(60)]);
    }
    if (config.birthdate !== 'NONE') add('tstBirthdate', req('birthdate'));
    if (config.gender !== 'NONE') add('ideGender', req('gender'));
    if (config.maritalStatus !== 'NONE') add('ideMaritalStatus', req('maritalStatus'));
    if (config.profession !== 'NONE') add('ideProfession', req('profession'));
    if (config.birthPlace !== 'NONE') add('desBirthPlace', [...req('birthPlace'), Validators.maxLength(60)]);
    if (config.email !== 'NONE') add('desEmail', [...req('email'), Validators.email, Validators.maxLength(60)]);
    return group;
  }

  private loadInsuredPersons(): void {
    this.insuredPersons.set([]);
    const pricing = this.pricing();
    if (!pricing || pricing.contract) return;
    const personRisks = pricing.risks.filter((risk) => this.isPersonRisk(risk.ideRiskProduct));
    if (personRisks.length === 0) return;
    const product = this.products().find((p) => p['CodProduct'] === pricing.codProduct);
    const config = resolveInsuredPersonConfig(product?.['ObjInsuredPersonFields']);
    this.insuredConfig.set(config);
    this.insuredPersons.set(
      personRisks.map((risk) => ({ risk, form: this.buildInsuredForm(config) })).sort((a, b) => a.risk.numRisk - b.risk.numRisk),
    );
    if (!this.insuredCatalogsLoaded) {
      this.insuredCatalogsLoaded = true;
      this.catalogService.list(IDENTIFICATION_TYPES_PATH).subscribe({ next: (rows) => this.identificationTypes.set(rows) });
      this.catalogService.list(GENDERS_PATH).subscribe({ next: (rows) => this.genders.set(rows) });
      this.catalogService.list(MARITAL_STATUSES_PATH).subscribe({ next: (rows) => this.maritalStatuses.set(rows) });
      this.catalogService.list(PROFESSIONS_PATH).subscribe({ next: (rows) => this.professions.set(rows) });
    }
  }

  /** Precarga nombre/apellidos/correo de una persona ya registrada con ese documento (si existe; si no, se creara al contratar). */
  lookupInsured(item: { risk: QuoteRisk; form: FormGroup }): void {
    const num = String(item.form.get('numIdentification')?.value ?? '').trim();
    if (!num) return;
    this.insuredSearching.set(item.risk.ideQuoteRisk);
    this.persons.lookup({ numIdentification: num }).subscribe({
      next: (person) => {
        this.insuredSearching.set(null);
        const patch: Record<string, string> = { desFirstName: person.DesFirstName };
        if (person.DesMiddleName) patch['desMiddleName'] = person.DesMiddleName;
        if (person.DesLastName1) patch['desLastName1'] = person.DesLastName1;
        if (person.DesLastName2) patch['desLastName2'] = person.DesLastName2;
        for (const [key, value] of Object.entries(patch)) item.form.get(key)?.setValue(value);
        this.messages.add({
          severity: 'info',
          summary: this.transloco.translate('quotes.insuredFoundSummary'),
          detail: this.transloco.translate('quotes.insuredFoundDetail'),
        });
      },
      error: () => {
        this.insuredSearching.set(null);
        this.messages.add({
          severity: 'info',
          summary: this.transloco.translate('quotes.insuredNotFoundSummary'),
          detail: this.transloco.translate('quotes.insuredNotFoundDetail'),
        });
      },
    });
  }

  private loadContractFields(): void {
    for (const key of Object.keys(this.contractFields.form.controls)) this.contractFields.form.removeControl(key);
    this.contractFields.fields.set([]);
    this.contractRiskFields.set([]);
    this.loadInsuredPersons();
    const ideProduct = this.pricing()?.ideProduct;
    if (!ideProduct || this.pricing()?.contract) {
      this.contractFields.loading.set(false);
      return;
    }
    for (const risk of this.pricing()?.risks ?? []) {
      this.riskAttributes.getSchema(risk.ideRiskProduct, 'CONTRACT').subscribe({
        next: (schema) => {
          if (schema.fields.length === 0) return;
          const state = buildRiskFieldsState(this.fb, risk.ideRiskProduct);
          for (const field of schema.fields) {
            state.form.addControl(
              field.ideAttributeProperty,
              this.fb.control(field.type === 'checkbox' ? false : null, buildValidators(field.validators)),
            );
          }
          state.fields.set(schema.fields);
          state.loading.set(false);
          this.contractRiskFields.update((current) =>
            [...current, { risk, state }].sort((a, b) => a.risk.numRisk - b.risk.numRisk),
          );
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
    this.contractFields.loading.set(true);
    this.riskAttributes.getSchema(ideProduct, 'CONTRACT').subscribe({
      next: (schema) => {
        for (const field of schema.fields) {
          this.contractFields.form.addControl(
            field.ideAttributeProperty,
            this.fb.control(field.type === 'checkbox' ? false : null, buildValidators(field.validators)),
          );
        }
        this.contractFields.fields.set(schema.fields);
        this.contractFields.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.contractFields.loading.set(false);
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
    const riskStates = this.contractRiskFields();
    const insured = this.insuredPersons();
    if (
      this.contractFields.loading() ||
      this.contractFields.form.invalid ||
      riskStates.some(({ state }) => state.form.invalid) ||
      insured.some(({ form }) => form.invalid)
    ) {
      this.contractFields.form.markAllAsTouched();
      for (const { state } of riskStates) state.form.markAllAsTouched();
      for (const { form } of insured) form.markAllAsTouched();
      return;
    }
    const riskPersons: Record<string, Record<string, string>> = {};
    for (const { risk, form } of insured) {
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(form.getRawValue() as Record<string, unknown>)) {
        const text = String(value ?? '').trim();
        if (text) values[key] = text;
      }
      riskPersons[risk.ideQuoteRisk] = values;
    }
    const riskValues: Record<string, Record<string, unknown>> = {};
    for (const { risk, state } of riskStates) riskValues[risk.ideQuoteRisk] = state.form.getRawValue();
    const generic = this.contractFields.fields().length > 0 ? this.contractFields.form.getRawValue() : undefined;
    this.contracting.set(true);
    this.quoting
      .createContract(
        this.ideQuote,
        this.paymentFraction() || undefined,
        generic,
        riskStates.length > 0 ? riskValues : undefined,
        insured.length > 0 ? riskPersons : undefined,
      )
      .subscribe({
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
          this.loadContractFields();
          return;
        }
        if (result.codState === 'ACEPTADO') {
          this.quoteAccepted.set(true);
          this.step.set('contract');
          this.loadContractFields();
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
    this.paymentFraction.set('');
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
    this.clearRisks();
    this.clearProductFields();
    this.selectedProductCode.set('');
    this.riskToAddControl.setValue(null);
    this.riskQuantityControl.setValue(1);
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
