import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TreeTableModule } from 'primeng/treetable';
import { TreeNode } from 'primeng/api';
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

const PATH = '/reference-data/site-map';

interface ParentOption {
  cod: string;
  label: string;
}

/**
 * `SSiteMap` -- ítems del árbol de menú, jerárquico vía
 * `IdeSiteMapParent`. El algoritmo real del menú (`FGetSiteMap`,
 * replicado en `SiteMapMenuService`) recorre como máximo 3 niveles
 * (raíz = nivel 1); un ítem de nivel 4 quedaría guardado en la base pero
 * NUNCA se mostraría en ningún menú real (confirmado leyendo
 * `site-map-menu.service.ts`: la recursión corta con `if (level < 3)`
 * sobre el nivel del ítem actual). Por eso acá, como resguardo de UI (no
 * hay restricción de este tipo en el backend), solo se ofrecen como
 * "padre" los ítems de nivel 1 o 2 -- así ningún ítem nuevo cae en un
 * nivel que jamás se renderiza.
 */
@Component({
  selector: 'app-site-map-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    TreeTableModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './site-map-tab.component.html',
})
export class SiteMapTabComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  private readonly allRows = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  readonly parentOptions = signal<ParentOption[]>([]);
  private editingRow: CatalogRow | null = null;

  readonly treeNodes = computed<TreeNode<CatalogRow>[]>(() => this.buildTree(this.allRows()));

  form = this.fb.nonNullable.group({
    cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
    des: ['', Validators.required],
    numOrder: [0, Validators.required],
    desPathOption: [''],
    image: [''],
    codSiteMapParent: [''],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.catalogService.list(PATH).subscribe({
      next: (rows) => {
        this.allRows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('menuConfig.siteMapRoles.loadSiteMapErrorDetail'),
        });
      },
    });
  }

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  canAddChild(row: CatalogRow): boolean {
    return this.levelOf(row, this.allRows()) < 3;
  }

  private parentId(row: CatalogRow): string | null {
    const value = row['IdeSiteMapParent'];
    return value ? String(value) : null;
  }

  private buildTree(rows: CatalogRow[]): TreeNode<CatalogRow>[] {
    const byParent = new Map<string | null, CatalogRow[]>();
    for (const row of rows) {
      const parent = this.parentId(row);
      const list = byParent.get(parent) ?? [];
      list.push(row);
      byParent.set(parent, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => Number(a['NumOrder'] ?? 0) - Number(b['NumOrder'] ?? 0));
    }
    const build = (parent: string | null): TreeNode<CatalogRow>[] =>
      (byParent.get(parent) ?? []).map((row) => ({
        data: row,
        key: String(row['IdeSiteMap']),
        children: build(String(row['IdeSiteMap'])),
        expanded: true,
      }));
    return build(null);
  }

  /** Nivel real (raíz = 1), recorriendo `IdeSiteMapParent` contra la lista completa. */
  private levelOf(row: CatalogRow, rows: CatalogRow[]): number {
    const byId = new Map(rows.map((r) => [String(r['IdeSiteMap']), r]));
    let level = 1;
    let current = row;
    let guard = 0;
    while (this.parentId(current) && guard < 10) {
      const parent = byId.get(this.parentId(current)!);
      if (!parent) break;
      level += 1;
      current = parent;
      guard += 1;
    }
    return level;
  }

  private descendantIds(id: string, rows: CatalogRow[]): Set<string> {
    const byParent = new Map<string | null, CatalogRow[]>();
    for (const row of rows) {
      const parent = this.parentId(row);
      const list = byParent.get(parent) ?? [];
      list.push(row);
      byParent.set(parent, list);
    }
    const result = new Set<string>();
    const walk = (parentId: string) => {
      for (const child of byParent.get(parentId) ?? []) {
        const childId = String(child['IdeSiteMap']);
        result.add(childId);
        walk(childId);
      }
    };
    walk(id);
    return result;
  }

  private computeParentOptions(excludeRow: CatalogRow | null): ParentOption[] {
    const rows = this.allRows();
    const excludeIds = new Set<string>();
    if (excludeRow) {
      const ownId = String(excludeRow['IdeSiteMap']);
      excludeIds.add(ownId);
      for (const id of this.descendantIds(ownId, rows)) excludeIds.add(id);
    }
    return rows
      .filter((row) => this.levelOf(row, rows) < 3 && !excludeIds.has(String(row['IdeSiteMap'])))
      .map((row) => ({
        cod: String(row['CodSiteMap']),
        label: `${'— '.repeat(this.levelOf(row, rows) - 1)}${row['DesSiteMap']}`,
      }));
  }

  openCreateRoot(): void {
    this.openCreateInternal('');
  }

  openCreateChild(parentRow: CatalogRow): void {
    this.openCreateInternal(String(parentRow['CodSiteMap']));
  }

  private openCreateInternal(codSiteMapParent: string): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.parentOptions.set(this.computeParentOptions(null));
    this.form = this.fb.nonNullable.group({
      cod: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      des: ['', Validators.required],
      numOrder: [0, Validators.required],
      desPathOption: [''],
      image: [''],
      codSiteMapParent: [codSiteMapParent],
    });
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.parentOptions.set(this.computeParentOptions(row));
    const rows = this.allRows();
    const parentId = this.parentId(row);
    const parentRow = parentId ? rows.find((r) => String(r['IdeSiteMap']) === parentId) : undefined;
    this.form = this.fb.nonNullable.group({
      cod: [{ value: String(row['CodSiteMap'] ?? ''), disabled: true }],
      des: [String(row['DesSiteMap'] ?? ''), Validators.required],
      numOrder: [Number(row['NumOrder'] ?? 0), Validators.required],
      desPathOption: [String(row['DesPathOption'] ?? '')],
      image: [String(row['Image'] ?? '')],
      codSiteMapParent: [parentRow ? String(parentRow['CodSiteMap']) : ''],
    });
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
    const body: Record<string, unknown> = {
      desSiteMap: raw.des,
      numOrder: raw.numOrder,
      desPathOption: raw.desPathOption || undefined,
      image: raw.image || undefined,
      codSiteMapParent: raw.codSiteMapParent,
    };

    if (this.dialogMode() === 'create') {
      this.catalogService.create(PATH, { ...body, codSiteMap: raw.cod }).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.createdDetail', { item: raw.des }),
          });
          this.closeDialog();
          this.load();
        },
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      const id = String(this.editingRow!['IdeSiteMap']);
      this.catalogService.update(PATH, id, body).subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('catalogs.updatedDetail', { item: raw.des }),
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
    const desc = String(row['DesSiteMap'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(
          nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction',
        ),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeSiteMap']);
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
