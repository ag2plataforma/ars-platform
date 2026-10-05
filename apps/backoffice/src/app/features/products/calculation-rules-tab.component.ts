import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { environment } from '../../../environments/environment';
import { FormulaChainEditorComponent } from './formula-chain-editor.component';
import { FormulaIfEditorComponent } from './formula-if-editor.component';
import {
  IfModel,
  SimpleOption,
  TermChain,
  ThenElseModel,
  emptyIf,
  emptyThenElse,
  parseIfExpression,
  parseThenElse,
  serializeIf,
  serializeThenElse,
} from './formula-builder.model';

const PATH = '/product-rating/calculation-rules';
const PLAN_PRODUCT_RISKS_PATH = '/product-rating/plan-product-risks';
const COVERAGE_PLANS_PATH = '/product-rating/coverage-plans';
const CONCEPTS_PATH = '/reference-data/concepts';
const ATTRIBUTES_PATH = '/reference-data/attributes';
const FIELD_DICTIONARY_PATH = '/reference-data/field-dictionary';
const RATE_TABLES_PATH = '/product-rating/rate-tables';
const ADJUSTMENTS_PATH = '/product-rating/adjustments';

type FormulaFieldName = 'formulaIf' | 'formulaThen' | 'formulaElse';

/** `SCalculationRule` -- las fórmulas del motor de reglas (`RulesEngineService`),
 * reemplazo real de `db:seed-example-rules`. Requiere siempre un
 * `SCoveragePlan` exacto (`ideCoveragePlan`), así que primero hay que
 * elegir Plan × Riesgo y, dentro de eso, la cobertura del plan -- mismo
 * criterio en cascada que `CoveragePlansTabComponent`. `codProduct`/
 * `idePlanProductRisk` (comodines de jerarquía más amplia, ver el
 * README de product-rating-service) quedan deliberadamente afuera de
 * este formulario: alcanza con el nivel exacto de cobertura para el
 * caso de uso real (armar un producto de punta a punta), y dejarlos
 * vacíos es la opción segura (no amplía el alcance de la regla más allá
 * de lo que el usuario ve acá). */
@Component({
  selector: 'app-calculation-rules-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    CheckboxModule,
    InputNumberModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
    FormulaChainEditorComponent,
    FormulaIfEditorComponent,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './calculation-rules-tab.component.html',
})
export class CalculationRulesTabComponent {
  readonly product = input.required<CatalogRow>();

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly planProductRisks = signal<CatalogRow[]>([]);
  readonly selectedPlanProductRiskId = signal<string>('');
  readonly coveragePlans = signal<CatalogRow[]>([]);
  readonly selectedCoveragePlanId = signal<string>('');
  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly concepts = signal<CatalogRow[]>([]);

  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  /** Panel de referencias del formulario de fórmula (backlog ítem 8, ver
   *  docs/02-roadmap.md) -- qué códigos existen para usar dentro de
   *  `rule('COD')`/`adjustment('COD')`/`FGetRateValue('COD',...)`/un
   *  campo personalizado, para no tener que ir a buscarlos a otra
   *  pantalla. Se cargan una vez al abrir el diálogo (crear o editar). */
  readonly fieldTokens = signal<CatalogRow[]>([]);
  readonly rateTables = signal<CatalogRow[]>([]);
  readonly adjustmentOptions = signal<CatalogRow[]>([]);
  readonly otherRules = signal<CatalogRow[]>([]);
  readonly loadingReferences = signal(false);

  /** Opciones simplificadas ("código — descripción") para los
   *  desplegables del constructor visual (backlog ítem 8, 2026-10-02) --
   *  derivadas de los mismos 4 catálogos que ya carga `loadFormulaReferences`,
   *  reusando los mismos helpers de label que el panel de referencias de
   *  "modo avanzado" (`fieldTokenCode`/`fieldTokenTitle`, etc.). */
  readonly fieldTokenChoices = computed<SimpleOption[]>(() =>
    this.fieldTokens().map((row) => ({ code: this.fieldTokenCode(row), label: `${this.fieldTokenCode(row)} — ${this.fieldTokenTitle(row)}` })),
  );
  readonly ruleChoices = computed<SimpleOption[]>(() =>
    this.otherRules().map((row) => ({ code: this.ruleCode(row), label: `${this.ruleCode(row)} — ${this.ruleTitle(row)}` })),
  );
  readonly adjustmentChoices = computed<SimpleOption[]>(() =>
    this.adjustmentOptions().map((row) => ({ code: this.adjustmentCode(row), label: `${this.adjustmentCode(row)} — ${this.adjustmentTitle(row)}` })),
  );
  readonly rateTableChoices = computed<SimpleOption[]>(() =>
    this.rateTables().map((row) => ({ code: this.rateTableCode(row), label: `${this.rateTableCode(row)} — ${this.rateTableTitle(row)}` })),
  );

  /** Modelos del constructor visual (backlog ítem 8, "todo el paquete" +
   *  "constructor con grupos anidados", decisiones del usuario 2026-10-02)
   *  -- uno por campo (IF/THEN/ELSE), independiente entre sí: una fórmula
   *  real puede tener, por ejemplo, un THEN que entra perfecto en el
   *  constructor pero un ELSE con algo fuera de alcance (`NOT`, etc.),
   *  así que cada campo cae a "modo avanzado" (`*AdvancedMode`) por su
   *  cuenta, nunca los 3 juntos. */
  readonly ifModel = signal<IfModel>(emptyIf());
  readonly thenModel = signal<ThenElseModel>(emptyThenElse());
  readonly elseModel = signal<ThenElseModel>(emptyThenElse());
  readonly ifAdvancedMode = signal(false);
  readonly thenAdvancedMode = signal(false);
  readonly elseAdvancedMode = signal(false);
  /** El panel de referencias de "modo avanzado" (clic para insertar) solo
   *  tiene sentido si ALGÚN campo está en modo avanzado -- si los 3 están
   *  en modo visual no hay ningún textarea enfocable donde insertar. */
  readonly anyAdvancedMode = computed(() => this.ifAdvancedMode() || this.thenAdvancedMode() || this.elseAdvancedMode());

  /** Diálogo "+ Nuevo campo" (backlog ítem 8) -- crea el par
   *  `SFieldDictionary` + `SAttribute` que hace falta para que un campo
   *  personalizado nuevo pueda usarse como referencia en una fórmula. El
   *  backend ya tenía el CRUD completo de ambos (`@Roles('ADMIN')`) pero
   *  ninguna pantalla del backoffice lo exponía antes de esto (reportado
   *  por el usuario 2026-10-02: "me sale que no hay campos personalizados
   *  y eso no es asi"). */
  readonly newFieldDialogVisible = signal(false);
  newFieldForm = this.fb.nonNullable.group({
    cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
    des: ['', Validators.required],
  });

  /** Último campo (IF/THEN/ELSE) que tuvo foco -- ahí se inserta al hacer
   *  clic en una referencia del panel. `formulaIf` por defecto (antes de
   *  que el usuario haga foco en ninguno). */
  readonly focusedFormulaField = signal<FormulaFieldName>('formulaIf');
  private readonly ifFieldRef = viewChild<ElementRef<HTMLTextAreaElement>>('ifField');
  private readonly thenFieldRef = viewChild<ElementRef<HTMLTextAreaElement>>('thenField');
  private readonly elseFieldRef = viewChild<ElementRef<HTMLTextAreaElement>>('elseField');

  /** Validación "en seco" contra `POST /calculation-rules/validate-formula`
   *  (backlog ítem 8) -- `null` significa "todavía no se validó en esta
   *  apertura del diálogo" (no se muestra ni éxito ni error), `[]`
   *  significa "validado, sin errores". Se limpia a `null` apenas el
   *  usuario vuelve a tocar cualquiera de los 3 campos de fórmula, para
   *  no mostrar un resultado que ya quedó desactualizado. */
  readonly validationErrors = signal<string[] | null>(null);
  readonly validating = signal(false);

  form = this.buildForm();

  constructor() {
    this.loadPlanProductRisks();
  }

  /** Se vuelve a pedir cada vez que el usuario abre el desplegable
   *  (`(onShow)` en el template, mismo criterio ya usado en
   *  `SiteMapRolesTabComponent`/`ApplicationRolesTabComponent`) -- si
   *  crea un Plan x Riesgo nuevo en la pestaña "Plan x Riesgo" (sibling,
   *  las 7 pestañas de `ProductsComponent` se montan todas juntas) y
   *  vuelve acá sin recargar la página, la lista pedida solo en el
   *  `constructor` quedaría desactualizada (bug reportado y confirmado
   *  por el usuario, 2026-09-29). Pública por eso mismo, ya no `private`. */

  planProductRiskLabel(row: CatalogRow): string {
    const plan = row['SPlanProduct'] as Record<string, unknown> | undefined;
    const riskProduct = row['SRiskProduct'] as Record<string, unknown> | undefined;
    const risk = riskProduct?.['SRisk'] as Record<string, unknown> | undefined;
    return `${plan ? String(plan['DesPlanProduct'] ?? '') : '—'} / ${risk ? String(risk['DesRisk'] ?? '') : '—'}`;
  }

  coveragePlanLabel(row: CatalogRow): string {
    const coverage = row['SCoverage'] as Record<string, unknown> | undefined;
    return coverage ? String(coverage['DesCoverage'] ?? '') : '—';
  }

  loadPlanProductRisks(): void {
    this.catalogService.list(PLAN_PRODUCT_RISKS_PATH).subscribe({
      next: (all) => {
        const codProduct = this.product()['CodProduct'];
        this.planProductRisks.set(
          all.filter((r) => {
            const plan = r['SPlanProduct'] as Record<string, unknown> | undefined;
            const planProduct = plan?.['SProduct'] as Record<string, unknown> | undefined;
            return planProduct?.['CodProduct'] === codProduct;
          }),
        );
      },
    });
  }

  onSelectPlanProductRisk(id: string | null): void {
    this.selectedPlanProductRiskId.set(id ?? '');
    this.selectedCoveragePlanId.set('');
    this.rows.set([]);
    if (!id) {
      this.coveragePlans.set([]);
      return;
    }
    this.loadCoveragePlanOptions(id);
  }

  /** Extraído de `onSelectPlanProductRisk` para poder pedirlo de nuevo
   *  desde `(onShow)` del segundo desplegable sin cambiar la selección
   *  -- mismo motivo que `loadPlanProductRisks` (bug reportado y
   *  confirmado por el usuario, 2026-09-29): si se crea una cobertura
   *  nueva en la pestaña "Coverage Plans" (sibling) mientras este
   *  Plan x Riesgo ya está elegido acá, la lista pedida una sola vez en
   *  `onSelectPlanProductRisk` quedaría desactualizada. */
  private loadCoveragePlanOptions(idePlanProductRisk: string): void {
    this.catalogService.list(COVERAGE_PLANS_PATH, { idePlanProductRisk }).subscribe({
      next: (rows) => this.coveragePlans.set(rows),
    });
  }

  reloadCoveragePlanOptions(): void {
    const id = this.selectedPlanProductRiskId();
    if (id) this.loadCoveragePlanOptions(id);
  }

  onSelectCoveragePlan(id: string | null): void {
    this.selectedCoveragePlanId.set(id ?? '');
    if (id) this.load(id);
    else this.rows.set([]);
  }

  private load(ideCoveragePlan: string): void {
    this.loading.set(true);
    this.catalogService.list(PATH, { ideCoveragePlan }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate<string>('common.error'),
          detail: this.transloco.translate<string>('products.calculationRules.loadErrorDetail'),
        });
      },
    });
  }

  private loadOptions(): void {
    this.catalogService.list(CONCEPTS_PATH).subscribe({ next: (rows) => this.concepts.set(rows) });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  /** Carga los 4 catálogos del panel de referencias (backlog ítem 8) --
   *  se pide siempre que se abre el diálogo (crear o editar), y también
   *  después de crear un campo nuevo desde "+ Nuevo campo", mismo
   *  criterio de "pedir de nuevo por si se dio de alta algo en otra
   *  pestaña mientras tanto" que `loadPlanProductRisks`/
   *  `loadCoveragePlanOptions`. `otherRules` excluye la regla que se está
   *  editando (no tiene sentido ofrecer `rule('MISMOCODIGO')` de una
   *  misma regla sobre sí misma). */
  private loadFormulaReferences(): void {
    this.loadingReferences.set(true);
    const editingCod = this.editingRow ? String(this.editingRow['CodCalculationRule'] ?? '') : null;
    forkJoin({
      fields: this.catalogService.list(ATTRIBUTES_PATH),
      rateTables: this.catalogService.list(RATE_TABLES_PATH),
      adjustments: this.catalogService.list(ADJUSTMENTS_PATH),
      rules: this.catalogService.list(PATH),
    }).subscribe({
      next: ({ fields, rateTables, adjustments, rules }) => {
        this.fieldTokens.set(fields.filter((row) => this.isActive(row)));
        this.rateTables.set(rateTables.filter((row) => this.isActive(row)));
        this.adjustmentOptions.set(adjustments.filter((row) => this.isActive(row)));
        this.otherRules.set(
          rules.filter((row) => this.isActive(row) && String(row['CodCalculationRule'] ?? '') !== editingCod),
        );
        this.loadingReferences.set(false);
      },
      error: () => this.loadingReferences.set(false),
    });
  }

  /** Código real del campo personalizado -- el token tal cual se usa
   *  dentro de una fórmula (ej. `EDAD`), NO el código de `SAttribute`
   *  (que puede ser distinto, ver doc-comment de `AttributesService`). */
  fieldTokenCode(row: CatalogRow): string {
    const dict = row['SFieldDictionary'] as Record<string, unknown> | undefined;
    return dict ? String(dict['CodFieldDictionary'] ?? '') : '';
  }

  fieldTokenTitle(row: CatalogRow): string {
    return String(row['DesAttribute'] ?? '');
  }

  ruleCode(row: CatalogRow): string {
    return String(row['CodCalculationRule'] ?? '');
  }

  ruleTitle(row: CatalogRow): string {
    return String(row['DesCalculationRule'] ?? '');
  }

  adjustmentCode(row: CatalogRow): string {
    return String(row['CodAdjustment'] ?? '');
  }

  adjustmentTitle(row: CatalogRow): string {
    return String(row['DesAdjustment'] ?? '');
  }

  rateTableCode(row: CatalogRow): string {
    return String(row['CodRateTable'] ?? '');
  }

  rateTableTitle(row: CatalogRow): string {
    return String(row['DesRateTable'] ?? '');
  }

  onFormulaFieldFocus(field: FormulaFieldName): void {
    this.focusedFormulaField.set(field);
  }

  private fieldRefFor(field: FormulaFieldName): ElementRef<HTMLTextAreaElement> | undefined {
    if (field === 'formulaIf') return this.ifFieldRef();
    if (field === 'formulaThen') return this.thenFieldRef();
    return this.elseFieldRef();
  }

  /** Inserta `text` en el campo de fórmula (IF/THEN/ELSE) que tuvo el
   *  último foco, en la posición exacta del cursor (no al final) --
   *  mismo criterio de UX que cualquier editor de código con
   *  autocompletado. Si por algún motivo el `ElementRef` todavía no está
   *  disponible (diálogo recién abierto, el usuario no clickeó ningún
   *  campo todavía) hace fallback a agregar al final. Solo aplica en
   *  "modo avanzado" (ver `anyAdvancedMode`). */
  insertFormulaReference(text: string): void {
    const field = this.focusedFormulaField();
    const control = this.form.get(field);
    if (!control) return;
    const current = String(control.value ?? '');
    const el = this.fieldRefFor(field)?.nativeElement;
    if (el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      control.setValue(current.slice(0, start) + text + current.slice(end));
      control.markAsDirty();
      const cursor = start + text.length;
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    } else {
      control.setValue(current ? `${current} ${text}` : text);
      control.markAsDirty();
    }
    this.validationErrors.set(null);
  }

  /** Limpia el resultado de la última validación -- se llama desde
   *  `(input)` de los 3 campos de fórmula para no mostrar un resultado ya
   *  desactualizado apenas el usuario edita a mano (clickear una
   *  referencia ya limpia desde `insertFormulaReference`). */
  onFormulaFieldInput(): void {
    this.validationErrors.set(null);
  }

  // ---------------------------------------------------------------------
  // Constructor visual (backlog ítem 8, 2026-10-02) -- cada `on*ModelChange`
  // actualiza el modelo estructurado Y re-serializa hacia el control de
  // formulario correspondiente (`formulaIf`/`formulaThen`/`formulaElse`),
  // que sigue siendo el "formato de cable" real hacia `submit()`/
  // `validateFormulaNow()` -- esos dos métodos no cambiaron.
  // ---------------------------------------------------------------------

  onIfModelChange(model: IfModel): void {
    this.ifModel.set(model);
    this.form.get('formulaIf')?.setValue(serializeIf(model));
    this.form.get('formulaIf')?.markAsDirty();
    this.validationErrors.set(null);
  }

  onThenModelChange(model: ThenElseModel): void {
    this.thenModel.set(model);
    this.form.get('formulaThen')?.setValue(serializeThenElse(model));
    this.form.get('formulaThen')?.markAsDirty();
    this.validationErrors.set(null);
  }

  onThenChainChange(chain: TermChain): void {
    this.onThenModelChange({ ...this.thenModel(), chain });
  }

  onThenRoundToggle(enabled: boolean): void {
    this.onThenModelChange({ ...this.thenModel(), round: { ...this.thenModel().round, enabled } });
  }

  onThenRoundDecimals(decimals: number | null): void {
    this.onThenModelChange({ ...this.thenModel(), round: { ...this.thenModel().round, decimals: decimals ?? 0 } });
  }

  onElseModelChange(model: ThenElseModel): void {
    this.elseModel.set(model);
    this.form.get('formulaElse')?.setValue(serializeThenElse(model));
    this.form.get('formulaElse')?.markAsDirty();
    this.validationErrors.set(null);
  }

  onElseChainChange(chain: TermChain): void {
    this.onElseModelChange({ ...this.elseModel(), chain });
  }

  onElseRoundToggle(enabled: boolean): void {
    this.onElseModelChange({ ...this.elseModel(), round: { ...this.elseModel().round, enabled } });
  }

  onElseRoundDecimals(decimals: number | null): void {
    this.onElseModelChange({ ...this.elseModel(), round: { ...this.elseModel().round, decimals: decimals ?? 0 } });
  }

  /** Alterna entre el constructor visual y el textarea de siempre, por
   *  campo. Al volver DE "modo avanzado" HACIA el visual, reintenta
   *  parsear el texto actual (puede haber cambiado a mano) -- si no entra
   *  en el subconjunto soportado (ver `formula-builder.model.ts`) avisa y
   *  se queda en modo avanzado, nunca se arriesga a mostrar algo distinto
   *  de lo que hay. Entrar A modo avanzado siempre funciona (el texto ya
   *  serializado queda tal cual en el control). */
  toggleIfAdvanced(): void {
    if (!this.ifAdvancedMode()) {
      this.ifAdvancedMode.set(true);
      return;
    }
    const parsed = parseIfExpression(String(this.form.get('formulaIf')?.value ?? ''));
    if (!parsed) {
      this.warnCannotParse();
      return;
    }
    this.ifModel.set(parsed);
    this.ifAdvancedMode.set(false);
  }

  toggleThenAdvanced(): void {
    if (!this.thenAdvancedMode()) {
      this.thenAdvancedMode.set(true);
      return;
    }
    const parsed = parseThenElse(String(this.form.get('formulaThen')?.value ?? ''));
    if (!parsed) {
      this.warnCannotParse();
      return;
    }
    this.thenModel.set(parsed);
    this.thenAdvancedMode.set(false);
  }

  toggleElseAdvanced(): void {
    if (!this.elseAdvancedMode()) {
      this.elseAdvancedMode.set(true);
      return;
    }
    const parsed = parseThenElse(String(this.form.get('formulaElse')?.value ?? ''));
    if (!parsed) {
      this.warnCannotParse();
      return;
    }
    this.elseModel.set(parsed);
    this.elseAdvancedMode.set(false);
  }

  private warnCannotParse(): void {
    this.messages.add({
      severity: 'warn',
      summary: this.transloco.translate<string>('products.calculationRules.builder.cannotParseSummary'),
      detail: this.transloco.translate<string>('products.calculationRules.builder.cannotParseDetail'),
    });
  }

  // ---------------------------------------------------------------------
  // "+ Nuevo campo" (backlog ítem 8, 2026-10-02) -- crea el par
  // `SFieldDictionary` + `SAttribute` necesario para un campo personalizado
  // nuevo, usando el mismo código para ambos (ver doc-comment de
  // `submitNewField`).
  // ---------------------------------------------------------------------

  openNewFieldDialog(): void {
    this.newFieldForm.reset({ cod: '', des: '' });
    this.newFieldDialogVisible.set(true);
  }

  closeNewFieldDialog(): void {
    this.newFieldDialogVisible.set(false);
  }

  /** Crea el par `SFieldDictionary` + `SAttribute` que hace falta para que
   *  un campo personalizado nuevo pueda usarse como referencia en una
   *  fórmula -- el backend ya tenía el CRUD completo de ambos
   *  (`FieldDictionaryController`/`AttributesController`, los dos
   *  `@Roles('ADMIN')`) pero ninguna pantalla del backoffice lo exponía
   *  antes de esto (reportado por el usuario 2026-10-02: "me sale que no
   *  hay campos personalizados y eso no es asi"). Usa el MISMO código
   *  para `CodFieldDictionary` y `CodAttribute` -- es el token que después
   *  aparece tal cual dentro de la fórmula (ver `fieldTokenCode`), tener
   *  dos códigos distintos para la misma cosa solo confundiría. */
  submitNewField(): void {
    if (this.newFieldForm.invalid) {
      this.newFieldForm.markAllAsTouched();
      return;
    }
    const { cod, des } = this.newFieldForm.getRawValue();
    this.catalogService.create(FIELD_DICTIONARY_PATH, { codFieldDictionary: cod, desFieldDictionary: des }).subscribe({
      next: () => {
        this.catalogService
          .create(ATTRIBUTES_PATH, { codAttribute: cod, desAttribute: des, codFieldDictionary: cod })
          .subscribe({
            next: () => {
              this.messages.add({
                severity: 'success',
                summary: this.transloco.translate<string>('common.done'),
                detail: this.transloco.translate<string>('products.calculationRules.builder.newFieldCreated'),
              });
              this.closeNewFieldDialog();
              this.loadFormulaReferences();
            },
            error: (err: HttpErrorResponse) => this.showError(err),
          });
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  private currentFormula(): { if: string; then: string; else: string } {
    const raw = this.form.getRawValue();
    return { if: raw.formulaIf, then: raw.formulaThen, else: raw.formulaElse };
  }

  /** Botón "Validar fórmula" -- chequeo exploratorio, sin guardar nada
   *  (backlog ítem 8). `submit()` vuelve a correr la misma validación
   *  antes de persistir, así que este botón es solo para que el admin
   *  pueda iterar la fórmula sin abrir/cerrar el diálogo de guardado. */
  validateFormulaNow(): void {
    if (this.form.get('formulaIf')?.invalid || this.form.get('formulaThen')?.invalid || this.form.get('formulaElse')?.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.validating.set(true);
    this.http
      .post<{ valid: boolean; errors: string[] }>(`${environment.apiUrl}${PATH}/validate-formula`, {
        formula: this.currentFormula(),
      })
      .subscribe({
        next: (res) => {
          this.validating.set(false);
          this.validationErrors.set(res.errors);
          if (res.valid) {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate<string>('common.done'),
              detail: this.transloco.translate<string>('products.calculationRules.validDetail'),
            });
          }
        },
        error: (err: HttpErrorResponse) => {
          this.validating.set(false);
          this.showError(err);
        },
      });
  }

  conceptName(row: CatalogRow): string {
    const rel = row['SConcept'] as Record<string, unknown> | undefined;
    return rel ? String(rel['DesConcept'] ?? '') : '—';
  }

  private relCode(row: CatalogRow | undefined, relation: string, codField: string): string {
    if (!row) return '';
    const rel = row[relation] as Record<string, unknown> | undefined;
    return rel ? String(rel[codField] ?? '') : '';
  }

  private buildForm(row?: CatalogRow) {
    const formula = (row?.['FormulaJSON'] as { IF?: string; THEN?: string; ELSE?: string } | undefined) ?? {};
    return this.fb.nonNullable.group({
      cod: [
        { value: row ? String(row['CodCalculationRule'] ?? '') : '', disabled: !!row },
        [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)],
      ],
      des: [row ? String(row['DesCalculationRule'] ?? '') : '', Validators.required],
      codConcept: [this.relCode(row, 'SConcept', 'CodConcept'), Validators.required],
      order: [row ? Number(row['Order'] ?? 0) : 0, Validators.required],
      codEntityReference: [row ? String(row['CodEntityReference'] ?? '') : ''],
      desColumnName: [row ? String(row['DesColumnName'] ?? '') : ''],
      formulaIf: [formula.IF ?? '', Validators.required],
      formulaThen: [formula.THEN ?? '', Validators.required],
      formulaElse: [formula.ELSE ?? '', Validators.required],
    });
  }

  /** Al editar una regla existente, intenta mostrar el constructor visual
   *  para cada campo (IF/THEN/ELSE) por separado -- si la fórmula guardada
   *  no entra en el subconjunto soportado (ver doc-comment de
   *  `formula-builder.model.ts`: paréntesis anidados fuera de lo
   *  esperado, `NOT`, etc.) ESE campo puntual cae a "modo avanzado" (el
   *  textarea de siempre), sin arriesgarse a mostrar/guardar algo
   *  distinto de lo que el admin ya tenía. */
  private initBuildersFromFormula(raw: { formulaIf: string; formulaThen: string; formulaElse: string }): void {
    const ifParsed = parseIfExpression(raw.formulaIf);
    this.ifModel.set(ifParsed ?? emptyIf());
    this.ifAdvancedMode.set(!ifParsed);

    const thenParsed = parseThenElse(raw.formulaThen);
    this.thenModel.set(thenParsed ?? emptyThenElse());
    this.thenAdvancedMode.set(!thenParsed);

    const elseParsed = parseThenElse(raw.formulaElse);
    this.elseModel.set(elseParsed ?? emptyThenElse());
    this.elseAdvancedMode.set(!elseParsed);
  }

  /** Para una regla nueva: escribe en los controles del form el texto
   *  serializado de los modelos visuales recién inicializados (`TRUE`/`0`
   *  por defecto), para que `submit()` no falle por `Validators.required`
   *  antes de que el admin toque nada -- antes de esto, una regla nueva
   *  arrancaba con los 3 campos vacíos y obligaba a usar el panel de
   *  referencias o escribir a mano. */
  private syncFormulaControlsFromBuilders(): void {
    this.form.get('formulaIf')?.setValue(serializeIf(this.ifModel()));
    this.form.get('formulaThen')?.setValue(serializeThenElse(this.thenModel()));
    this.form.get('formulaElse')?.setValue(serializeThenElse(this.elseModel()));
  }

  openCreate(): void {
    if (!this.selectedCoveragePlanId()) return;
    this.dialogMode.set('create');
    this.editingRow = null;
    this.loadOptions();
    this.loadFormulaReferences();
    this.validationErrors.set(null);
    this.focusedFormulaField.set('formulaIf');
    this.form = this.buildForm();
    this.ifModel.set(emptyIf());
    this.thenModel.set(emptyThenElse());
    this.elseModel.set(emptyThenElse());
    this.ifAdvancedMode.set(false);
    this.thenAdvancedMode.set(false);
    this.elseAdvancedMode.set(false);
    this.syncFormulaControlsFromBuilders();
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.loadOptions();
    this.loadFormulaReferences();
    this.validationErrors.set(null);
    this.focusedFormulaField.set('formulaIf');
    this.form = this.buildForm(row);
    this.initBuildersFromFormula(this.form.getRawValue());
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  /** Guarda -- pero antes vuelve a correr la misma validación "en seco"
   *  que el botón "Validar fórmula" (backlog ítem 8): así un error de
   *  sintaxis o un código inexistente/inactivo se detecta ACÁ, no recién
   *  cuando se cotiza de verdad y el cálculo da un resultado silenciosamente
   *  mal (ver doc-comment de `validateCalculationFormula` en el backend).
   *  Si el usuario ya clickeó "Validar fórmula" y no tocó nada después,
   *  esto repite la misma llamada -- se prefirió la garantía (nunca
   *  guardar algo no revalidado) sobre ahorrarse un request. */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const formula = this.currentFormula();
    this.validating.set(true);
    this.http
      .post<{ valid: boolean; errors: string[] }>(`${environment.apiUrl}${PATH}/validate-formula`, { formula })
      .subscribe({
        next: (res) => {
          this.validating.set(false);
          this.validationErrors.set(res.errors);
          if (!res.valid) {
            this.messages.add({
              severity: 'error',
              summary: this.transloco.translate<string>('common.error'),
              detail: this.transloco.translate<string>('products.calculationRules.invalidDetail'),
            });
            return;
          }
          this.persist(formula);
        },
        error: (err: HttpErrorResponse) => {
          this.validating.set(false);
          this.showError(err);
        },
      });
  }

  private persist(formula: { if: string; then: string; else: string }): void {
    const raw = this.form.getRawValue();
    const body: Record<string, unknown> = {
      desCalculationRule: raw.des,
      codConcept: raw.codConcept,
      order: raw.order,
      formula,
    };
    if (raw.codEntityReference) body['codEntityReference'] = raw.codEntityReference;
    if (raw.desColumnName) body['desColumnName'] = raw.desColumnName;

    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, { codCalculationRule: raw.cod, ideCoveragePlan: this.selectedCoveragePlanId(), ...body })
        .subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate<string>('common.done'),
              detail: this.transloco.translate<string>('products.calculationRules.createdDetail'),
            });
            this.closeDialog();
            this.load(this.selectedCoveragePlanId());
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
    } else {
      const id = String(this.editingRow!['IdeCalculationRule']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate<string>('common.done'),
            detail: this.transloco.translate<string>('products.calculationRules.updatedDetail'),
          });
          this.closeDialog();
          this.load(this.selectedCoveragePlanId());
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    const desc = String(row['DesCalculationRule'] ?? '');
    const action = this.transloco.translate<string>(
      nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
    );
    this.confirm.confirm({
      header: this.transloco.translate<string>(
        nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader',
      ),
      message: this.transloco.translate<string>('catalogs.toggleConfirm', { action, item: desc }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeCalculationRule']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate<string>('common.done'),
              detail: this.transloco.translate<string>('common.stateUpdated'),
            });
            this.load(this.selectedCoveragePlanId());
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        });
      },
    });
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate<string>('common.error'), detail });
  }
}
