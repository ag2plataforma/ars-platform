import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';
import { RiskFieldsDialogComponent } from '../products/risk-fields-dialog.component';

const PATH = '/reference-data/model-attributes';
const ENTITIES_PATH = '/reference-data/entities';
const PRODUCTS_PATH = '/product-rating/products';
const RISK_PRODUCTS_PATH = '/product-rating/risk-products';

/** Entidades (`SEntity.CodEntity`) cuyo `IdeReference` se puede elegir de una lista. El resto se escribe como id. */
const ENTITY_PRODUCT = 'SProduct';
const ENTITY_RISK_PRODUCT = 'SRiskProduct';

/**
 * `SModelAttribute` -- "a qué aplica un set de campos personalizados": la entidad a la que se aplica
 * (`SProduct` = campos a nivel de producto, `SRiskProduct` = campos de cada riesgo) y la referencia
 * concreta (el producto o el tipo de riesgo). Los campos del set (`SAttributeProperty`) se editan desde
 * el botón "Campos" -- el mismo diálogo simplificado que usa la configuración de productos.
 */
@Component({
  selector: 'app-model-attributes',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    RiskFieldsDialogComponent,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './model-attributes.component.html',
})
export class ModelAttributesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly entities = signal<CatalogRow[]>([]);
  readonly products = signal<CatalogRow[]>([]);
  readonly riskProducts = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  readonly saving = signal(false);
  private editingRow: CatalogRow | null = null;

  /** Diálogo de campos (ver `RiskFieldsDialogComponent`). */
  readonly fieldsVisible = signal(false);
  readonly fieldsProductId = signal<string | null>(null);
  readonly fieldsRiskProductId = signal<string | null>(null);
  readonly fieldsLabel = signal('');

  form = this.buildForm();
  /** `CodEntity` de referencia elegido (signal para que el selector de referencia reaccione). */
  readonly referenceEntity = signal('');

  /** Opciones del selector de referencia segun la entidad de referencia. */
  readonly referenceOptions = computed(() => {
    const entity = this.referenceEntity();
    if (entity === ENTITY_PRODUCT) {
      return this.products().map((p) => ({ value: String(p['IdeProduct']), label: `${p['DesProduct']} (${p['CodProduct']})` }));
    }
    if (entity === ENTITY_RISK_PRODUCT) {
      return this.riskProducts().map((r) => ({ value: String(r['IdeRiskProduct']), label: this.riskProductLabel(r) }));
    }
    return null; // sin lista: se escribe el id
  });

  private readonly referenceLabels = computed(() => {
    const labels = new Map<string, string>();
    for (const p of this.products()) labels.set(String(p['IdeProduct']), `${p['DesProduct']}`);
    for (const r of this.riskProducts()) labels.set(String(r['IdeRiskProduct']), this.riskProductLabel(r));
    return labels;
  });

  constructor() {
    this.catalogService.list(ENTITIES_PATH).subscribe({ next: (rows) => this.entities.set(rows) });
    this.catalogService.list(PRODUCTS_PATH).subscribe({ next: (rows) => this.products.set(rows) });
    this.catalogService.list(RISK_PRODUCTS_PATH).subscribe({ next: (rows) => this.riskProducts.set(rows) });
    this.load();
  }

  private buildForm(row?: CatalogRow) {
    return this.fb.nonNullable.group({
      cod: [{ value: row ? String(row['CodModelAttribute'] ?? '') : '', disabled: !!row }, [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      des: [row ? String(row['DesModelAttribute'] ?? '') : '', Validators.required],
      codEntityApply: [this.entityCode(row, 'IdeEntityApply'), Validators.required],
      codEntityReference: [this.entityCode(row, 'IdeEntityReference'), Validators.required],
      ideReference: [row ? String(row['IdeReference'] ?? '') : '', Validators.required],
    });
  }

  private entityCode(row: CatalogRow | undefined, field: 'IdeEntityApply' | 'IdeEntityReference'): string {
    if (!row) return '';
    const relation = row[`SEntity_SModelAttribute_${field}ToSEntity`] as Record<string, unknown> | undefined;
    return String(relation?.['CodEntity'] ?? '');
  }

  entityLabel(row: CatalogRow, field: 'IdeEntityApply' | 'IdeEntityReference'): string {
    const relation = row[`SEntity_SModelAttribute_${field}ToSEntity`] as Record<string, unknown> | undefined;
    return relation ? `${relation['DesEntity']} (${relation['CodEntity']})` : '';
  }

  referenceLabel(row: CatalogRow): string {
    const id = String(row['IdeReference'] ?? '');
    return this.referenceLabels().get(id) ?? id;
  }

  private riskProductLabel(row: CatalogRow): string {
    const risk = row['SRisk'] as Record<string, unknown> | undefined;
    const product = row['SProduct'] as Record<string, unknown> | undefined;
    const des = risk ? String(risk['DesRisk'] ?? '') : String(row['CodRiskProduct'] ?? '');
    return product ? `${des} — ${product['DesProduct']}` : des;
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(PATH).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('modelAttributes.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  /** El set se puede editar con el diálogo de campos solo si se refiere a un producto o a un tipo de riesgo. */
  canEditFields(row: CatalogRow): boolean {
    const code = this.entityCode(row, 'IdeEntityReference');
    return code === ENTITY_PRODUCT || code === ENTITY_RISK_PRODUCT;
  }

  openFields(row: CatalogRow): void {
    const code = this.entityCode(row, 'IdeEntityReference');
    const id = String(row['IdeReference']);
    this.fieldsProductId.set(code === ENTITY_PRODUCT ? id : null);
    this.fieldsRiskProductId.set(code === ENTITY_RISK_PRODUCT ? id : null);
    this.fieldsLabel.set(this.referenceLabel(row));
    this.fieldsVisible.set(true);
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.form = this.buildForm();
    this.referenceEntity.set('');
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.form = this.buildForm(row);
    this.referenceEntity.set(this.entityCode(row, 'IdeEntityReference'));
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  /** Al cambiar la entidad de referencia, la referencia anterior ya no aplica. */
  onReferenceEntityChange(): void {
    this.referenceEntity.set(this.form.controls.codEntityReference.value);
    this.form.controls.ideReference.setValue('');
  }

  /** Atajo: si la entidad "a la que aplica" y la de referencia coinciden (el caso normal), se copia al elegir la primera. */
  onApplyEntityChange(): void {
    if (this.form.controls.codEntityReference.value) return;
    this.form.controls.codEntityReference.setValue(this.form.controls.codEntityApply.value);
    this.onReferenceEntityChange();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    const done = (detailKey: string) => ({
      next: () => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate(detailKey),
        });
        this.closeDialog();
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.showError(err);
      },
    });
    if (this.dialogMode() === 'create') {
      this.catalogService
        .create(PATH, {
          codModelAttribute: raw.cod,
          desModelAttribute: raw.des,
          codEntityApply: raw.codEntityApply,
          codEntityReference: raw.codEntityReference,
          ideReference: raw.ideReference.trim(),
        })
        .subscribe(done('modelAttributes.createdDetail'));
    } else {
      this.catalogService
        .update(PATH, String(this.editingRow!['IdeModelAttribute']), {
          desModelAttribute: raw.des,
          codEntityApply: raw.codEntityApply,
          codEntityReference: raw.codEntityReference,
          ideReference: raw.ideReference.trim(),
        })
        .subscribe(done('modelAttributes.updatedDetail'));
    }
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: String(row['DesModelAttribute'] ?? ''),
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.catalogService.setState(PATH, String(row['IdeModelAttribute']), nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('modelAttributes.toggledDetail'),
            });
            this.load();
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
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
