import { Component, OnInit, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { CatalogRow } from '../../core/catalogs/catalog.model';

interface TierRow {
  numFrom: number | null;
  numTo: number | null;
  amtPerInsured: number | null;
}

interface TierApi {
  NumFrom: number;
  NumTo: number | null;
  AmtPerInsured: number;
}

const TIERS_PATH = `${environment.apiUrl}/product-rating/collective-tiers`;

/**
 * Tramos de tarifa de un colectivo con prima única: "desde N hasta M asegurados -> prima anual
 * por asegurado". Se editan todos juntos y se guardan de una vez (el backend valida que sean
 * contiguos desde 1 y que solo el último quede sin tope). Al cambiar un tramo se aplica a las
 * nuevas cotizaciones, altas/bajas y renovaciones; no reprecia retroactivamente.
 */
@Component({
  selector: 'app-collective-tiers-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputNumberModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex flex-col gap-4">
      <p class="max-w-2xl text-sm text-slate-500">{{ 'products.tiers.subtitle' | transloco }}</p>

      <div class="overflow-x-auto">
        <table class="w-full max-w-2xl text-sm">
          <thead>
            <tr class="text-left text-slate-500">
              <th class="py-2 pr-3 font-medium">{{ 'products.tiers.fromColumn' | transloco }}</th>
              <th class="py-2 pr-3 font-medium">{{ 'products.tiers.toColumn' | transloco }}</th>
              <th class="py-2 pr-3 font-medium">{{ 'products.tiers.amountColumn' | transloco }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index) {
              <tr class="border-t border-slate-100">
                <td class="py-2 pr-3">
                  <p-inputNumber [(ngModel)]="row.numFrom" [min]="1" [useGrouping]="false" inputStyleClass="w-24" />
                </td>
                <td class="py-2 pr-3">
                  <p-inputNumber
                    [(ngModel)]="row.numTo"
                    [min]="1"
                    [useGrouping]="false"
                    [placeholder]="'products.tiers.noLimit' | transloco"
                    inputStyleClass="w-24"
                  />
                </td>
                <td class="py-2 pr-3">
                  <p-inputNumber
                    [(ngModel)]="row.amtPerInsured"
                    mode="decimal"
                    [minFractionDigits]="2"
                    [maxFractionDigits]="2"
                    [min]="0.01"
                    inputStyleClass="w-32"
                  />
                </td>
                <td class="py-2">
                  <button pButton type="button" icon="pi pi-trash" severity="danger" [text]="true" size="small" (click)="removeRow($index)"></button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="flex gap-2">
        <button pButton type="button" icon="pi pi-plus" severity="secondary" [outlined]="true" [label]="'products.tiers.addButton' | transloco" (click)="addRow()"></button>
        <button pButton type="button" icon="pi pi-save" [label]="'products.tiers.saveButton' | transloco" [loading]="saving()" (click)="save()"></button>
      </div>
    </div>
  `,
})
export class CollectiveTiersTabComponent implements OnInit {
  readonly product = input.required<CatalogRow>();

  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<TierRow[]>([]);
  readonly saving = signal(false);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.http.get<TierApi[]>(`${TIERS_PATH}/${String(this.product()['CodProduct'])}`).subscribe({
      next: (tiers) =>
        this.rows.set(
          tiers.length > 0
            ? tiers.map((t) => ({ numFrom: t.NumFrom, numTo: t.NumTo, amtPerInsured: t.AmtPerInsured }))
            : [{ numFrom: 1, numTo: null, amtPerInsured: null }],
        ),
      error: (err: HttpErrorResponse) => this.showError(err),
    });
  }

  addRow(): void {
    const rows = this.rows();
    const last = rows[rows.length - 1];
    // El tramo nuevo continúa donde termina el último (que pasa a tener tope si no lo tenía).
    const nextFrom = last ? (last.numTo ?? (last.numFrom ?? 0) + 9) + 1 : 1;
    if (last && last.numTo === null) last.numTo = nextFrom - 1;
    this.rows.set([...rows, { numFrom: nextFrom, numTo: null, amtPerInsured: null }]);
  }

  removeRow(index: number): void {
    this.rows.set(this.rows().filter((_, i) => i !== index));
  }

  save(): void {
    const tiers = this.rows();
    if (tiers.length === 0 || tiers.some((t) => !t.numFrom || !t.amtPerInsured)) {
      this.messages.add({
        severity: 'warn',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('products.tiers.incomplete'),
      });
      return;
    }
    this.saving.set(true);
    this.http
      .put<TierApi[]>(`${TIERS_PATH}/${String(this.product()['CodProduct'])}`, {
        tiers: tiers.map((t) => ({ numFrom: t.numFrom, numTo: t.numTo ?? null, amtPerInsured: t.amtPerInsured })),
      })
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.rows.set(saved.map((t) => ({ numFrom: t.NumFrom, numTo: t.NumTo, amtPerInsured: t.AmtPerInsured })));
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('products.tiers.saved'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.showError(err);
        },
      });
  }

  private showError(err: HttpErrorResponse): void {
    const raw = err.error && typeof err.error === 'object' && 'message' in err.error ? (err.error as { message: unknown }).message : null;
    const detail = Array.isArray(raw) ? raw.join(', ') : raw ? String(raw) : this.transloco.translate<string>('common.unexpectedError');
    this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
  }
}
