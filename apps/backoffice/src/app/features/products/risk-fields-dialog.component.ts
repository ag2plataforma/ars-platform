import { Component, effect, inject, input, model, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/reference-data/risk-fields`;

interface RiskFieldOption {
  ideFieldValue: string;
  desFieldValue: string;
  active: boolean;
}

interface RiskField {
  ideAttributeProperty: string;
  codAttributeProperty: string;
  label: string;
  type: string;
  required: boolean;
  min: number | null;
  max: number | null;
  maxLength: number | null;
  codFieldDictionary: string;
  desFieldDictionary: string;
  ownDictionary: boolean;
  options: RiskFieldOption[];
  codState: string;
}

interface DictionaryOption {
  codFieldDictionary: string;
  desFieldDictionary: string;
  optionCount: number;
  /** Texto para mostrar en el desplegable. */
  label: string;
}

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'radio', 'checkbox'] as const;

/**
 * Campos personalizados de un tipo de riesgo (`SRiskProduct`): lo que se pide de cada riesgo al
 * cotizar (p. ej. "Raza" de una mascota, "Año" de un vehículo). Configuración simplificada del
 * motor de atributos -- ver `RiskFieldsService` en `reference-data-service`. Un campo solo influye
 * en la tarifa si una tabla de factores lo usa; si no, es un dato informativo del riesgo.
 */
@Component({
  selector: 'app-risk-fields-dialog',
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
    TextareaModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './risk-fields-dialog.component.html',
})
export class RiskFieldsDialogComponent {
  readonly ideRiskProduct = input<string | null>(null);
  readonly riskLabel = input<string>('');
  readonly visible = model<boolean>(false);

  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly fields = signal<RiskField[]>([]);
  readonly loading = signal(false);
  readonly dictionaries = signal<DictionaryOption[]>([]);
  readonly formVisible = signal(false);
  readonly saving = signal(false);
  readonly editing = signal<RiskField | null>(null);

  readonly typeOptions = FIELD_TYPES.map((value) => ({ value, key: `products.riskFields.type.${value}` }));

  form = this.buildForm();

  constructor() {
    effect(() => {
      if (this.visible() && this.ideRiskProduct()) this.load();
    });
  }

  private buildForm(field?: RiskField) {
    return this.fb.nonNullable.group({
      label: [field?.label ?? '', Validators.required],
      type: [{ value: field?.type ?? 'text', disabled: !!field }, Validators.required],
      required: [field?.required ?? false],
      min: [field?.min as number | null],
      max: [field?.max as number | null],
      maxLength: [field?.maxLength as number | null],
      optionsSource: ['new' as 'new' | 'existing'],
      optionsText: [field ? field.options.filter((o) => o.active).map((o) => o.desFieldValue).join('\n') : ''],
      codFieldDictionary: [''],
    });
  }

  load(): void {
    const id = this.ideRiskProduct();
    if (!id) return;
    this.loading.set(true);
    this.http.get<RiskField[]>(`${BASE}/by-risk-product/${id}`).subscribe({
      next: (rows) => {
        this.fields.set(rows);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.showError(err);
      },
    });
  }

  typeLabel(type: string): string {
    return (FIELD_TYPES as readonly string[]).includes(type)
      ? this.transloco.translate(`products.riskFields.type.${type}`)
      : type;
  }

  isList(type: string | null | undefined): boolean {
    return type === 'select' || type === 'radio';
  }

  isActive(field: RiskField): boolean {
    return field.codState === 'ACTIVO';
  }

  activeOptionCount(field: RiskField): number {
    return field.options.filter((o) => o.active).length;
  }

  openCreate(): void {
    this.editing.set(null);
    this.form = this.buildForm();
    this.http.get<Omit<DictionaryOption, 'label'>[]>(`${BASE}/dictionaries`).subscribe({
      next: (rows) =>
        this.dictionaries.set(
          rows.map((r) => ({ ...r, label: `${r.desFieldDictionary} (${r.optionCount})` })),
        ),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.formVisible.set(true);
  }

  openEdit(field: RiskField): void {
    this.editing.set(field);
    this.form = this.buildForm(field);
    this.formVisible.set(true);
  }

  closeForm(): void {
    this.formVisible.set(false);
  }

  private parseOptions(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const editing = this.editing();
    const type = editing?.type ?? raw.type;
    const body: Record<string, unknown> = { label: raw.label.trim(), required: raw.required };
    if (type === 'number') {
      body['min'] = raw.min ?? (editing ? null : undefined);
      body['max'] = raw.max ?? (editing ? null : undefined);
    }
    if (type === 'text') body['maxLength'] = raw.maxLength ?? (editing ? null : undefined);

    let request$: Observable<unknown>;
    if (editing) {
      if (this.isList(type) && editing.ownDictionary) body['options'] = this.parseOptions(raw.optionsText);
      request$ = this.http.patch(`${BASE}/${editing.ideAttributeProperty}`, body);
    } else {
      body['ideRiskProduct'] = this.ideRiskProduct();
      body['type'] = type;
      if (this.isList(type)) {
        if (raw.optionsSource === 'existing') {
          if (!raw.codFieldDictionary) {
            this.form.controls.codFieldDictionary.markAsTouched();
            this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail: this.transloco.translate('products.riskFields.pickDictionary') });
            return;
          }
          body['codFieldDictionary'] = raw.codFieldDictionary;
        } else {
          const options = this.parseOptions(raw.optionsText);
          if (options.length === 0) {
            this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail: this.transloco.translate('products.riskFields.needOptions') });
            return;
          }
          body['options'] = options;
        }
      }
      request$ = this.http.post(BASE, body);
    }

    this.saving.set(true);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate(editing ? 'products.riskFields.updatedDetail' : 'products.riskFields.createdDetail'),
        });
        this.closeForm();
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.showError(err);
      },
    });
  }

  toggleState(field: RiskField): void {
    const codState = this.isActive(field) ? 'INACTIVO' : 'ACTIVO';
    this.http.patch(`${BASE}/${field.ideAttributeProperty}/state`, { codState }).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('common.done'),
          detail: this.transloco.translate('common.stateUpdated'),
        });
        this.load();
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  private showError(err: HttpErrorResponse): void {
    const detail =
      (err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : null) ?? this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail, life: 8000 });
  }
}
