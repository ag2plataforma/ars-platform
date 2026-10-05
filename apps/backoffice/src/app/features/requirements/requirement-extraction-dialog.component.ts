import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { environment } from '../../../environments/environment';

/** Datos del documento ya confirmados por una persona (`Data.extraction` del requisito). */
export interface StoredExtraction {
  fields: Array<{ key: string; label: string; value: string }>;
  documentType: string | null;
  source: 'AI';
  model: string | null;
  idAiRequest: string | null;
  usrConfirmed: string;
  tstConfirmed: string;
}

/** Qué requisito se está procesando. `ideQuote` solo aplica a requisitos de cotización. */
export interface ExtractionTarget {
  kind: 'QUOTE' | 'CONTRACT';
  id: string;
  ideQuote?: string;
  name: string;
  /** Si ya hay datos confirmados se muestran (y se pueden corregir) sin llamar a la IA. */
  stored: StoredExtraction | null;
}

interface ProposalResponse {
  idAiRequest: string;
  documentType: string | null;
  fields: Array<{ key: string; label: string; value: string; confidence: 'ALTA' | 'MEDIA' | 'BAJA' }>;
  notes: string | null;
  model: string;
}

interface EditableField {
  key: string;
  label: string;
  value: string;
  confidence: 'ALTA' | 'MEDIA' | 'BAJA' | null;
}

/** Extrae el contenido `Data.extraction` de un requisito (tolerante a `Data` nulo o con otra forma). */
export function storedExtractionOf(data: unknown): StoredExtraction | null {
  const extraction = (data as { extraction?: StoredExtraction } | null)?.extraction;
  return extraction && Array.isArray(extraction.fields) ? extraction : null;
}

/**
 * Diálogo de extracción de datos con IA de un documento de requisito (Fase 4),
 * compartido por el wizard de Cotización y el detalle de Contrato. La IA solo
 * PROPONE: nada se guarda hasta que la persona revisa/corrige y confirma.
 */
@Component({
  selector: 'app-requirement-extraction-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, InputTextModule, MessageModule, TagModule, TranslocoPipe],
  templateUrl: './requirement-extraction-dialog.component.html',
})
export class RequirementExtractionDialogComponent {
  private readonly http = inject(HttpClient);

  readonly target = input<ExtractionTarget | null>(null);
  readonly closed = output<void>();
  readonly saved = output<StoredExtraction | null>();

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fields = signal<EditableField[]>([]);
  readonly notes = signal<string | null>(null);
  readonly documentType = signal<string | null>(null);
  readonly idAiRequest = signal<string | null>(null);
  /** `true` mientras se muestran datos ya confirmados (en vez de una propuesta nueva). */
  readonly showingStored = signal(false);
  readonly storedInfo = signal<StoredExtraction | null>(null);

  constructor() {
    effect(() => {
      const t = this.target();
      untracked(() => {
        this.reset();
        if (!t) return;
        if (t.stored) this.showStored(t.stored);
        else this.runExtraction(t);
      });
    });
  }

  private reset(): void {
    this.loading.set(false);
    this.saving.set(false);
    this.errorMessage.set(null);
    this.fields.set([]);
    this.notes.set(null);
    this.documentType.set(null);
    this.idAiRequest.set(null);
    this.showingStored.set(false);
    this.storedInfo.set(null);
  }

  private showStored(stored: StoredExtraction): void {
    this.showingStored.set(true);
    this.storedInfo.set(stored);
    this.documentType.set(stored.documentType);
    this.idAiRequest.set(stored.idAiRequest);
    this.fields.set(stored.fields.map((f) => ({ ...f, confidence: null })));
  }

  /** Botón "Volver a extraer con IA" desde la vista de datos guardados. */
  reExtract(): void {
    const t = this.target();
    if (!t) return;
    this.reset();
    this.runExtraction(t);
  }

  private runExtraction(t: ExtractionTarget): void {
    this.loading.set(true);
    this.http.post<ProposalResponse>(`${this.basePath(t)}/extract`, {}).subscribe({
      next: (p) => {
        this.fields.set(p.fields.map((f) => ({ ...f })));
        this.notes.set(p.notes);
        this.documentType.set(p.documentType);
        this.idAiRequest.set(p.idAiRequest);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(this.messageOf(err));
      },
    });
  }

  setValue(index: number, value: string): void {
    this.fields.update((list) => list.map((f, i) => (i === index ? { ...f, value } : f)));
  }

  removeField(index: number): void {
    this.fields.update((list) => list.filter((_, i) => i !== index));
  }

  confirm(): void {
    const t = this.target();
    if (!t || this.saving()) return;
    const fields = this.fields()
      .map((f) => ({ key: f.key, label: f.label, value: f.value.trim() }))
      .filter((f) => f.value);
    this.saving.set(true);
    this.errorMessage.set(null);
    this.http
      .patch<{ extraction: StoredExtraction | null }>(`${this.basePath(t)}/extraction`, {
        fields,
        documentType: this.documentType() ?? undefined,
        idAiRequest: this.idAiRequest() ?? undefined,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.saved.emit(res.extraction);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.errorMessage.set(this.messageOf(err));
        },
      });
  }

  close(): void {
    this.closed.emit();
  }

  private basePath(t: ExtractionTarget): string {
    return t.kind === 'CONTRACT'
      ? `${environment.apiUrl}/underwriting/contract-requirements/${t.id}`
      : `${environment.apiUrl}/underwriting/quotes/${t.ideQuote}/requirements/${t.id}`;
  }

  private messageOf(err: HttpErrorResponse): string {
    const m = err.error && typeof err.error === 'object' && 'message' in err.error ? (err.error as { message: unknown }).message : null;
    return Array.isArray(m) ? m.join(', ') : m ? String(m) : err.message;
  }
}
