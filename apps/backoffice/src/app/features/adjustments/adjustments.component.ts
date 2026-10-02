import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { CatalogRow } from '../../core/catalogs/catalog.model';

const PATH = '/product-rating/adjustments';

/**
 * `SAdjustment` -- catálogo genérico de recargos/descuentos
 * (docs/02-roadmap.md, Fase 2 backlog ítem 7). Pantalla bespoke (no el
 * `CatalogsComponent` genérico) porque tiene un campo numérico
 * (`pctAdjustment`, puede ser negativo) y uno booleano (`indAutomatic`)
 * que el formulario genérico de catálogo no sabe editar todavía
 * (`CatalogFieldType` no tiene tipos `number`/`boolean`) -- mismo
 * criterio que `ClaimTypesComponent`/`ProductRequirementsComponent`.
 *
 * `indAutomatic` es, por ahora, solo informativo en esta pantalla: un
 * ajuste marcado "Automático" queda reservado para cuando se programe
 * una condición real (ver doc-comment de
 * `setup-generic-adjustments-tables.js`) -- el wizard de cotización
 * (`AdjustmentsStepComponent` en quotes) solo ofrece para aplicar a mano
 * los que NO son automáticos.
 */
@Component({
  selector: 'app-adjustments',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    CheckboxModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TooltipModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './adjustments.component.html',
})
export class AdjustmentsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  form = this.newForm();

  constructor() {
    this.load();
  }

  private newForm() {
    return this.fb.nonNullable.group({
      codAdjustment: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      desAdjustment: ['', Validators.required],
      pctAdjustment: [0, Validators.required],
      indAutomatic: [false],
    });
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
          detail: this.transloco.translate('adjustments.loadErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  openCreate(): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.form = this.newForm();
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.form = this.newForm();
    this.form.patchValue({
      codAdjustment: String(row['CodAdjustment'] ?? ''),
      desAdjustment: String(row['DesAdjustment'] ?? ''),
      pctAdjustment: Number(row['PctAdjustment'] ?? 0),
      indAutomatic: Boolean(row['IndAutomatic']),
    });
    this.form.controls.codAdjustment.disable();
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const isCreate = this.dialogMode() === 'create';
    const body = {
      codAdjustment: raw.codAdjustment,
      desAdjustment: raw.desAdjustment,
      pctAdjustment: raw.pctAdjustment,
      indAutomatic: raw.indAutomatic,
    };

    if (isCreate) {
      this.catalogService.create(PATH, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.createdDetail', { item: raw.desAdjustment }),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdeAdjustment']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.updatedDetail', { item: raw.desAdjustment }),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    const desc = String(row['DesAdjustment'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeAdjustment']);
        this.catalogService.setState(PATH, id, nextState).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: this.transloco.translate('common.done'),
              detail: this.transloco.translate('catalogs.toggledDetail', {
                item: desc,
                state: this.transloco.translate(nextState === 'ACTIVO' ? 'common.active' : 'common.inactive').toLowerCase(),
              }),
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
