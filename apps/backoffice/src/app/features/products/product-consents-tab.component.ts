import { Component, OnInit, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { CatalogRow } from '../../core/catalogs/catalog.model';

/** Asignación de un consentimiento del catálogo a la acción PAGO del producto (`SProductConsent`). */
interface ProductConsent {
  IdeProductConsent: string;
  IdeConsent: string;
  CodConsent: string;
  DesConsent: string;
  IndMandatory: boolean;
  NumOrder: number;
  TstInitial: string;
  TstEnd: string;
  CodState: string;
}

const ASSIGN_PATH = `${environment.apiUrl}/product-rating/product-consents`;
const CATALOG_PATH = `${environment.apiUrl}/party/consents`;
const DEFAULT_END_DATE = '2099-12-31';

/**
 * Consentimientos que el tomador debe aceptar en la landing de pago de este
 * producto. Se ELIGEN del catálogo global (`SConsent`, party-service); desde
 * acá también se pueden crear/editar los del catálogo, que hasta ahora no
 * tenía pantalla. El contenido (`DesConsentContent`) se guarda como
 * `{ text, url? }`.
 */
@Component({
  selector: 'app-product-consents-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './product-consents-tab.component.html',
})
export class ProductConsentsTabComponent implements OnInit {
  readonly product = input.required<CatalogRow>();

  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<ProductConsent[]>([]);
  readonly loading = signal(false);
  readonly catalog = signal<CatalogRow[]>([]);

  readonly assignVisible = signal(false);
  readonly assignControl = this.fb.nonNullable.control('', Validators.required);

  readonly editVisible = signal(false);
  readonly editingId = signal<string | null>(null);
  form = this.buildForm();

  ngOnInit(): void {
    this.load();
  }

  private buildForm(row?: CatalogRow) {
    const content = (row?.['DesConsentContent'] ?? {}) as Record<string, unknown>;
    const text = typeof content['text'] === 'string' ? content['text'] : typeof content['label'] === 'string' ? content['label'] : '';
    return this.fb.nonNullable.group({
      codConsent: [{ value: row ? String(row['CodConsent']) : '', disabled: !!row }, [Validators.required, Validators.maxLength(30)]],
      desConsent: [row ? String(row['DesConsent']) : '', [Validators.required, Validators.maxLength(200)]],
      text: [text, Validators.required],
      url: [typeof content['url'] === 'string' ? content['url'] : ''],
      indMandatory: [row ? !!row['IndMandatory'] : true],
      numOrder: [row ? Number(row['NumOrder']) : 1, [Validators.required, Validators.min(0)]],
      tstInitial: [row ? String(row['TstInitial']).slice(0, 10) : new Date().toISOString().slice(0, 10), Validators.required],
      tstEnd: [row ? String(row['TstEnd']).slice(0, 10) : DEFAULT_END_DATE, Validators.required],
    });
  }

  load(): void {
    this.loading.set(true);
    this.http
      .get<ProductConsent[]>(ASSIGN_PATH, { params: { codProduct: String(this.product()['CodProduct']) } })
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.showError(err);
        },
      });
  }

  isActive(row: ProductConsent): boolean {
    return row.CodState === 'ACTIVO';
  }

  // --- Elegir del catálogo -------------------------------------------------

  openAssign(): void {
    this.assignControl.reset('');
    this.http.get<CatalogRow[]>(CATALOG_PATH).subscribe({
      next: (rows) => this.catalog.set(rows.filter((r) => r.SState?.CodState === 'ACTIVO')),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
    this.assignVisible.set(true);
  }

  availableCatalog(): CatalogRow[] {
    const used = new Set(this.rows().map((r) => r.CodConsent));
    return this.catalog().filter((c) => !used.has(String(c['CodConsent'])));
  }

  assign(): void {
    if (this.assignControl.invalid) {
      this.assignControl.markAsTouched();
      return;
    }
    this.assignCode(this.assignControl.value, () => this.assignVisible.set(false));
  }

  private assignCode(codConsent: string, done: () => void): void {
    this.http
      .post(ASSIGN_PATH, { codProduct: this.product()['CodProduct'], codConsent, codAction: 'PAGO' })
      .subscribe({
        next: () => {
          done();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.consents.assignedDetail'),
          });
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
  }

  remove(row: ProductConsent): void {
    this.confirm.confirm({
      header: this.transloco.translate('products.consents.removeHeader'),
      message: this.transloco.translate('products.consents.removeConfirm', { item: row.DesConsent }),
      icon: 'pi pi-exclamation-triangle',
      accept: () =>
        this.http.delete(`${ASSIGN_PATH}/${row.IdeProductConsent}`).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('products.consents.removedDetail'),
            });
            this.load();
          },
          error: (err: HttpErrorResponse) => this.showError(err),
        }),
    });
  }

  // --- Crear / editar en el catálogo ---------------------------------------

  openCreate(): void {
    this.editingId.set(null);
    this.form = this.buildForm();
    this.editVisible.set(true);
  }

  openEdit(row: ProductConsent): void {
    this.http.get<CatalogRow>(`${CATALOG_PATH}/${row.IdeConsent}`).subscribe({
      next: (consent) => {
        this.editingId.set(row.IdeConsent);
        this.form = this.buildForm(consent);
        this.editVisible.set(true);
      },
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  closeEdit(): void {
    this.editVisible.set(false);
  }

  submitEdit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    if (raw.tstEnd < raw.tstInitial) {
      this.messages.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('products.consents.rangeError'),
      });
      return;
    }
    const content: Record<string, unknown> = { text: raw.text.trim() };
    if (raw.url.trim()) content['url'] = raw.url.trim();
    const common = {
      desConsent: raw.desConsent.trim(),
      desConsentContent: content,
      indMandatory: raw.indMandatory,
      numOrder: raw.numOrder,
      tstInitial: raw.tstInitial,
      tstEnd: raw.tstEnd,
    };

    const id = this.editingId();
    if (id) {
      this.http.patch(`${CATALOG_PATH}/${id}`, common).subscribe({
        next: () => {
          this.closeEdit();
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.consents.updatedDetail'),
          });
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
      return;
    }
    // Alta en el catálogo (global) y asignación inmediata a este producto.
    this.http.post(CATALOG_PATH, { codConsent: raw.codConsent.trim(), ...common }).subscribe({
      next: () => this.assignCode(raw.codConsent.trim(), () => this.closeEdit()),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  private showError(err: HttpErrorResponse): void {
    const raw = err.error && typeof err.error === 'object' && 'message' in err.error ? (err.error as { message: unknown }).message : null;
    const detail = Array.isArray(raw) ? raw.join(', ') : raw ? String(raw) : this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
