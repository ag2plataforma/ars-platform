import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { ContractReceiptOption, DocumentTemplatesService, PersonRoleOption } from './document-templates.service';

/** `COTIZACION` no se genera desde un contrato: sale de la cotización
 *  ("Descargar cotización en PDF" en el resumen de Cotización). */
const TEMPLATE_TYPES = [
  { value: 'CONTRATO', label: 'Póliza / Contrato' },
  { value: 'RECIBO', label: 'Recibo de pago' },
  { value: 'COMUNICADO', label: 'Comunicado' },
];

interface GeneratedDocument {
  ideContractOperationDocument: string;
  desFileName: string;
  tstRequest: string;
}

/**
 * Pestaña "Documentos" del detalle de contrato (docs/02-roadmap.md,
 * item 5) -- primer tipo implementado de punta a punta: "Póliza/Contrato
 * emitido" (`codTemplateType='CONTRATO'`). Componente standalone
 * embebido (ver contract-detail.component.html) para no tener que tocar
 * la lógica ya extensa de `ContractDetailComponent` más de lo
 * imprescindible (una línea de template + el tab nuevo).
 *
 * La descarga del PDF (`application/pdf`, detrás del mismo JWT que todo
 * lo demás) no puede ser un `<a href>` directo -- hace falta pedirlo por
 * `HttpClient` como blob y disparar la descarga a mano (no hay ningún
 * precedente de descarga de archivo binario en este frontend todavía).
 */
@Component({
  selector: 'app-contract-documents',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    SelectModule,
    TextareaModule,
    ToastModule,
    TranslocoPipe,
  ],
  providers: [MessageService],
  templateUrl: './contract-documents.component.html',
})
export class ContractDocumentsComponent implements OnChanges {
  @Input({ required: true }) ideContract!: string;

  private readonly http = inject(HttpClient);
  private readonly templatesService = inject(DocumentTemplatesService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly templateTypes = TEMPLATE_TYPES;
  readonly personRoles = signal<PersonRoleOption[]>([]);
  readonly documents = signal<GeneratedDocument[]>([]);
  readonly loading = signal(false);
  readonly generating = signal(false);
  readonly generateDialogVisible = signal(false);

  readonly receipts = signal<ContractReceiptOption[]>([]);

  readonly generateForm = this.fb.nonNullable.group({
    codTemplateType: ['CONTRATO', Validators.required],
    idePersonRol: ['', Validators.required],
    ideReceipt: [''],
    mensaje: [''],
  });

  constructor() {
    this.templatesService.listPersonRoles().subscribe({ next: (rows) => this.personRoles.set(rows) });
    // RECIBO exige elegir un recibo (obligatorio solo para ese tipo).
    this.generateForm.controls.codTemplateType.valueChanges.subscribe((type) => {
      const receiptControl = this.generateForm.controls.ideReceipt;
      if (type === 'RECIBO') {
        receiptControl.addValidators(Validators.required);
      } else {
        receiptControl.clearValidators();
        receiptControl.setValue('');
      }
      receiptControl.updateValueAndValidity();
    });
  }

  get selectedType(): string {
    return this.generateForm.controls.codTemplateType.value;
  }

  ngOnChanges(): void {
    if (this.ideContract) this.loadDocuments();
  }

  private loadDocuments(): void {
    this.loading.set(true);
    this.http
      .get<GeneratedDocument[]>(`${environment.apiUrl}/documents/generation/contracts/${this.ideContract}`)
      .subscribe({
        next: (rows) => {
          this.documents.set(rows);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  openGenerate(): void {
    this.generateForm.reset({ codTemplateType: 'CONTRATO', idePersonRol: '', ideReceipt: '', mensaje: '' });
    this.receipts.set([]);
    this.templatesService.listContractReceipts(this.ideContract).subscribe({ next: (rows) => this.receipts.set(rows) });
    this.generateDialogVisible.set(true);
  }

  closeGenerate(): void {
    this.generateDialogVisible.set(false);
  }

  submitGenerate(): void {
    if (this.generateForm.invalid) return;
    this.generating.set(true);
    const raw = this.generateForm.getRawValue();
    const payload = {
      codTemplateType: raw.codTemplateType,
      idePersonRol: raw.idePersonRol,
      ...(raw.codTemplateType === 'RECIBO' ? { ideReceipt: raw.ideReceipt } : {}),
      ...(raw.codTemplateType === 'COMUNICADO' && raw.mensaje.trim() ? { mensaje: raw.mensaje.trim() } : {}),
    };
    this.http
      .post(`${environment.apiUrl}/documents/generation/contracts/${this.ideContract}`, payload)
      .subscribe({
        next: () => {
          this.generating.set(false);
          this.generateDialogVisible.set(false);
          this.messageService.add({
            severity: 'success',
            detail: this.transloco.translate<string>('contractDocuments.generated'),
          });
          this.loadDocuments();
        },
        error: (err: HttpErrorResponse) => {
          this.generating.set(false);
          this.messageService.add({ severity: 'error', detail: err.error?.message ?? err.message });
        },
      });
  }

  download(doc: GeneratedDocument): void {
    this.http
      .get(`${environment.apiUrl}/documents/generation/contracts/documents/${doc.ideContractOperationDocument}/download`, {
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = doc.desFileName || 'documento.pdf';
          link.click();
          window.URL.revokeObjectURL(url);
        },
        error: (err: HttpErrorResponse) => {
          this.messageService.add({ severity: 'error', detail: err.error?.message ?? err.message });
        },
      });
  }
}
