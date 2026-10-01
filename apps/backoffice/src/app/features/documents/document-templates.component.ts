import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  DocumentTemplatesService,
  DocumentTemplate,
  ProductOption,
  OperationProductOption,
  PersonRoleOption,
  fileToBase64,
} from './document-templates.service';

const TEMPLATE_TYPES = [
  { value: 'CONTRATO', label: 'Póliza / Contrato' },
  { value: 'RECIBO', label: 'Recibo de pago' },
  { value: 'COTIZACION', label: 'Cotización' },
  { value: 'COMUNICADO', label: 'Comunicado' },
];

/**
 * "Gestión de plantillas de documentos físicos" (docs/02-roadmap.md,
 * item 5) -- pantalla nueva y standalone (ruta propia, no una pestaña
 * más dentro de Productos) a propósito: evita tocar los archivos de
 * `features/products/*-tab.component.*`, que en este momento tienen
 * cambios sin commitear de otra tarea en curso.
 *
 * Flujo: elegir Producto -> elegir Operación (de las ya configuradas
 * para ese producto, ver `OperationProductsService` en el backend real)
 * -> ver/subir las plantillas .docx de esa combinación, una por tipo de
 * documento + rol de persona destinataria.
 */
@Component({
  selector: 'app-document-templates',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    SelectModule,
    InputNumberModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './document-templates.component.html',
})
export class DocumentTemplatesComponent {
  private readonly service = inject(DocumentTemplatesService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly templateTypes = TEMPLATE_TYPES;

  readonly products = signal<ProductOption[]>([]);
  readonly operationProducts = signal<OperationProductOption[]>([]);
  readonly templates = signal<DocumentTemplate[]>([]);
  readonly personRoles = signal<PersonRoleOption[]>([]);

  readonly selectedProduct = signal<string | null>(null);
  readonly selectedOperationProduct = signal<string | null>(null);
  readonly loadingTemplates = signal(false);
  readonly uploadDialogVisible = signal(false);
  readonly uploading = signal(false);
  selectedFile: File | null = null;

  readonly replaceDialogVisible = signal(false);
  readonly replacing = signal(false);
  replaceTarget: DocumentTemplate | null = null;
  selectedReplaceFile: File | null = null;

  readonly uploadForm = this.fb.nonNullable.group({
    codTemplateType: ['CONTRATO', Validators.required],
    idePersonRol: ['', Validators.required],
    numOrder: [1, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    this.service.listProducts().subscribe({ next: (rows) => this.products.set(rows) });
    this.service.listPersonRoles().subscribe({ next: (rows) => this.personRoles.set(rows) });
  }

  onProductChange(ideProduct: string | null): void {
    this.selectedProduct.set(ideProduct);
    this.selectedOperationProduct.set(null);
    this.templates.set([]);
    this.operationProducts.set([]);
    if (!ideProduct) return;
    this.service.listOperationProducts(ideProduct).subscribe({ next: (rows) => this.operationProducts.set(rows) });
  }

  onOperationProductChange(ideOperationProduct: string | null): void {
    this.selectedOperationProduct.set(ideOperationProduct);
    this.templates.set([]);
    if (!ideOperationProduct) return;
    this.loadTemplates(ideOperationProduct);
  }

  private loadTemplates(ideOperationProduct: string): void {
    this.loadingTemplates.set(true);
    this.service.listTemplates(ideOperationProduct).subscribe({
      next: (rows) => {
        this.templates.set(rows);
        this.loadingTemplates.set(false);
      },
      error: () => this.loadingTemplates.set(false),
    });
  }

  openUpload(): void {
    this.uploadForm.reset({ codTemplateType: 'CONTRATO', idePersonRol: '', numOrder: 1 });
    this.selectedFile = null;
    this.uploadDialogVisible.set(true);
  }

  closeUpload(): void {
    this.uploadDialogVisible.set(false);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  async submitUpload(): Promise<void> {
    const ideOperationProduct = this.selectedOperationProduct();
    if (!ideOperationProduct || this.uploadForm.invalid || !this.selectedFile) {
      this.messageService.add({
        severity: 'warn',
        detail: this.transloco.translate<string>('documentTemplates.missingFile'),
      });
      return;
    }
    this.uploading.set(true);
    try {
      const fileBase64 = await fileToBase64(this.selectedFile);
      const raw = this.uploadForm.getRawValue();
      this.service
        .createTemplate({
          ideOperationProduct,
          codTemplateType: raw.codTemplateType,
          idePersonRol: raw.idePersonRol,
          numOrder: raw.numOrder,
          fileName: this.selectedFile.name,
          fileBase64,
        })
        .subscribe({
          next: () => {
            this.uploading.set(false);
            this.uploadDialogVisible.set(false);
            this.messageService.add({
              severity: 'success',
              detail: this.transloco.translate<string>('documentTemplates.uploadSaved'),
            });
            this.loadTemplates(ideOperationProduct);
          },
          error: (err: HttpErrorResponse) => {
            this.uploading.set(false);
            this.messageService.add({ severity: 'error', detail: err.error?.message ?? err.message });
          },
        });
    } catch {
      this.uploading.set(false);
      this.messageService.add({
        severity: 'error',
        detail: this.transloco.translate<string>('documentTemplates.uploadError'),
      });
    }
  }

  /** "Reemplazar archivo" -- hueco que faltaba en la primera versión
   *  (el backend ya tenía `PATCH /templates/:id/file`, ver
   *  `TemplatesService.replaceFile`, pero no había forma de llegar a él
   *  desde la pantalla). No cambia tipo/rol/orden, solo el .docx. */
  openReplace(row: DocumentTemplate): void {
    this.replaceTarget = row;
    this.selectedReplaceFile = null;
    this.replaceDialogVisible.set(true);
  }

  closeReplace(): void {
    this.replaceDialogVisible.set(false);
    this.replaceTarget = null;
  }

  onReplaceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedReplaceFile = input.files?.[0] ?? null;
  }

  async submitReplace(): Promise<void> {
    const ideOperationProduct = this.selectedOperationProduct();
    const target = this.replaceTarget;
    if (!ideOperationProduct || !target || !this.selectedReplaceFile) {
      this.messageService.add({
        severity: 'warn',
        detail: this.transloco.translate<string>('documentTemplates.missingFile'),
      });
      return;
    }
    this.replacing.set(true);
    try {
      const fileBase64 = await fileToBase64(this.selectedReplaceFile);
      this.service
        .replaceTemplateFile(target.ideOperationProductTemplate, {
          fileName: this.selectedReplaceFile.name,
          fileBase64,
        })
        .subscribe({
          next: () => {
            this.replacing.set(false);
            this.closeReplace();
            this.messageService.add({
              severity: 'success',
              detail: this.transloco.translate<string>('documentTemplates.replaceSaved'),
            });
            this.loadTemplates(ideOperationProduct);
          },
          error: (err: HttpErrorResponse) => {
            this.replacing.set(false);
            this.messageService.add({ severity: 'error', detail: err.error?.message ?? err.message });
          },
        });
    } catch {
      this.replacing.set(false);
      this.messageService.add({
        severity: 'error',
        detail: this.transloco.translate<string>('documentTemplates.uploadError'),
      });
    }
  }
}
