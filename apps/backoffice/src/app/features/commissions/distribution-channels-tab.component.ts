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
import { Person, PersonsService } from '../../core/party/persons.service';

const PATH = '/party/distribution-channels';
const CHANNEL_TYPES_PATH = '/party/channel-types';
const BROKERS_PATH = '/party/brokers';

/** Fila ya aplanada del árbol (recorrido en profundidad) lista para pintar. */
export interface ChannelNode {
  row: CatalogRow;
  id: string;
  depth: number;
  childCount: number;
}

/**
 * `SDistributionChannel` -- estructura comercial recursiva: cada canal
 * puede colgar de otro (`IdeDistributionChannelParent`), llevar un
 * broker (`IdeBroker`) y/o una persona (`IdePerson`), un tipo
 * (`IdeChannelType`) y una imagen. Se muestra como árbol aplanado
 * (recorrido en profundidad con sangría y chevron) sobre un `p-table`
 * normal. El backend valida que no se creen ciclos.
 */
@Component({
  selector: 'app-distribution-channels-tab',
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
    TranslocoPipe,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './distribution-channels-tab.component.html',
})
export class DistributionChannelsTabComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly personsService = inject(PersonsService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  readonly rows = signal<CatalogRow[]>([]);
  readonly channelTypes = signal<CatalogRow[]>([]);
  readonly brokers = signal<CatalogRow[]>([]);
  readonly loading = signal(false);
  readonly dialogVisible = signal(false);
  readonly dialogMode = signal<'create' | 'edit'>('create');
  private editingRow: CatalogRow | null = null;

  /** Ids de los nodos colapsados (por defecto todo expandido). */
  readonly collapsed = signal<ReadonlySet<string>>(new Set());

  /** Árbol completo (sin respetar colapsados). */
  private readonly childrenByParent = computed(() => {
    const rows = this.rows();
    const ids = new Set(rows.map((r) => String(r['IdeDistributionChannel'])));
    const map = new Map<string, CatalogRow[]>();
    for (const row of rows) {
      const parent = row['IdeDistributionChannelParent'] as string | null | undefined;
      // Un padre que no existe en el listado se trata como raíz (huérfano).
      const key = parent && ids.has(parent) ? parent : '';
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a['CodDistributionChannel']).localeCompare(String(b['CodDistributionChannel'])));
    }
    return map;
  });

  /** Filas visibles: DFS respetando los nodos colapsados. */
  readonly visibleNodes = computed<ChannelNode[]>(() => {
    const map = this.childrenByParent();
    const collapsed = this.collapsed();
    const out: ChannelNode[] = [];
    const visited = new Set<string>();
    const walk = (parentKey: string, depth: number): void => {
      for (const row of map.get(parentKey) ?? []) {
        const id = String(row['IdeDistributionChannel']);
        if (visited.has(id)) continue; // defensa ante datos con ciclos
        visited.add(id);
        const kids = map.get(id) ?? [];
        out.push({ row, id, depth, childCount: kids.length });
        if (!collapsed.has(id)) walk(id, depth + 1);
      }
    };
    walk('', 0);
    return out;
  });

  /** Opciones de "canal padre": todos menos el canal editado y sus descendientes. */
  readonly parentOptions = signal<{ code: string; label: string }[]>([]);

  // --- Selector de persona ---
  readonly selectedPerson = signal<Person | null>(null);
  readonly personSearchControl = this.fb.control('');
  readonly personSearching = signal(false);
  readonly personFound = signal<Person | null>(null);
  readonly personNotFound = signal(false);
  readonly nameSearchControl = this.fb.control('');
  readonly nameSearching = signal(false);
  readonly nameSearchResults = signal<Person[]>([]);
  readonly nameSearchedEmpty = signal(false);

  form = this.buildForm();

  constructor() {
    this.loadChannelTypes();
    this.loadBrokers();
    this.load();
  }

  private buildForm(row?: CatalogRow, parentCode?: string) {
    const channelType = row?.['SChannelType'] as { CodChannelType?: string } | null | undefined;
    const parent = row?.['SDistributionChannel'] as { CodDistributionChannel?: string } | null | undefined;
    const broker = row?.['TBroker'] as { CodBroker?: string } | null | undefined;
    return this.fb.nonNullable.group({
      cod: [
        { value: row ? String(row['CodDistributionChannel'] ?? '') : '', disabled: !!row },
        row ? [] : [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)],
      ],
      des: [row ? String(row['DesDistributionChannel'] ?? '') : '', Validators.required],
      codChannelType: [channelType?.CodChannelType ?? ''],
      codParent: [parent?.CodDistributionChannel ?? parentCode ?? ''],
      codBroker: [broker?.CodBroker ?? ''],
      image: [row ? String(row['Image'] ?? '') : ''],
    });
  }

  private loadChannelTypes(): void {
    this.catalogService.list(CHANNEL_TYPES_PATH).subscribe({
      next: (rows) => this.channelTypes.set(rows),
      error: () => this.errorToast('commissions.channels.loadTypesErrorDetail'),
    });
  }

  private loadBrokers(): void {
    this.catalogService.list(BROKERS_PATH).subscribe({
      next: (rows) => this.brokers.set(rows),
      error: () => this.errorToast('commissions.channels.loadBrokersErrorDetail'),
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
        this.errorToast('commissions.channels.loadErrorDetail');
      },
    });
  }

  // --- Árbol ---

  toggleNode(node: ChannelNode): void {
    const next = new Set(this.collapsed());
    if (next.has(node.id)) next.delete(node.id);
    else next.add(node.id);
    this.collapsed.set(next);
  }

  isCollapsed(node: ChannelNode): boolean {
    return this.collapsed().has(node.id);
  }

  expandAll(): void {
    this.collapsed.set(new Set());
  }

  collapseAll(): void {
    const map = this.childrenByParent();
    const ids = new Set<string>();
    for (const [parent, list] of map.entries()) {
      if (parent && list.length > 0) ids.add(parent);
    }
    this.collapsed.set(ids);
  }

  /** Ids del canal y de todos sus descendientes. */
  private descendantsOf(id: string): Set<string> {
    const map = this.childrenByParent();
    const result = new Set<string>([id]);
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const child of map.get(current) ?? []) {
        const childId = String(child['IdeDistributionChannel']);
        if (!result.has(childId)) {
          result.add(childId);
          stack.push(childId);
        }
      }
    }
    return result;
  }

  private refreshParentOptions(editingId: string | null): void {
    const excluded = editingId ? this.descendantsOf(editingId) : new Set<string>();
    const list = this.rows()
      .filter((r) => !excluded.has(String(r['IdeDistributionChannel'])))
      .map((r) => ({
        code: String(r['CodDistributionChannel']),
        label: `${r['CodDistributionChannel']} — ${r['DesDistributionChannel']}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    this.parentOptions.set(list);
  }

  // --- Presentación de filas ---

  isActive(row: CatalogRow): boolean {
    return row.SState?.CodState === 'ACTIVO';
  }

  channelTypeName(row: CatalogRow): string {
    const t = row['SChannelType'] as { DesChannelType?: string } | null | undefined;
    return t?.DesChannelType ?? '';
  }

  brokerLabel(row: CatalogRow): string {
    const b = row['TBroker'] as { CodBroker?: string; DesBroker?: string } | null | undefined;
    return b ? `${b.CodBroker} — ${b.DesBroker}` : '';
  }

  personLabel(row: CatalogRow): string {
    const p = row['TPerson'] as Person | null | undefined;
    if (!p) return '';
    const name = [p.DesFirstName, p.DesLastName1].filter(Boolean).join(' ');
    return p.NumIdentification ? `${name} (${p.NumIdentification})` : name;
  }

  imageValue(row: CatalogRow): string {
    return String(row['Image'] ?? '').trim();
  }

  isImageUrl(value: string): boolean {
    return /^(https?:\/\/|data:image\/|\/)/i.test(value);
  }

  // --- Selector de persona ---

  private resetPersonSelection(): void {
    this.selectedPerson.set(null);
    this.personFound.set(null);
    this.personNotFound.set(false);
    this.personSearchControl.setValue('');
    this.nameSearchControl.setValue('');
    this.nameSearchResults.set([]);
    this.nameSearchedEmpty.set(false);
  }

  searchPerson(): void {
    const numIdentification = (this.personSearchControl.value ?? '').trim();
    if (!numIdentification) return;
    this.personSearching.set(true);
    this.personNotFound.set(false);
    this.personFound.set(null);
    this.personsService.lookup({ numIdentification }).subscribe({
      next: (person) => {
        this.personSearching.set(false);
        this.personFound.set(person);
      },
      error: () => {
        this.personSearching.set(false);
        this.personNotFound.set(true);
      },
    });
  }

  searchByName(): void {
    const q = (this.nameSearchControl.value ?? '').trim();
    if (q.length < 2) return;
    this.nameSearching.set(true);
    this.nameSearchedEmpty.set(false);
    this.nameSearchResults.set([]);
    this.personsService.searchByName(q).subscribe({
      next: (people) => {
        this.nameSearching.set(false);
        this.nameSearchResults.set(people);
        this.nameSearchedEmpty.set(people.length === 0);
      },
      error: (err: HttpErrorResponse) => {
        this.nameSearching.set(false);
        this.showError(err);
      },
    });
  }

  pickPerson(person: Person): void {
    this.selectedPerson.set(person);
    this.personFound.set(null);
    this.personNotFound.set(false);
    this.personSearchControl.setValue('');
    this.nameSearchControl.setValue('');
    this.nameSearchResults.set([]);
    this.nameSearchedEmpty.set(false);
  }

  clearPerson(): void {
    this.resetPersonSelection();
  }

  // --- Alta / edición ---

  openCreate(parent?: CatalogRow): void {
    this.dialogMode.set('create');
    this.editingRow = null;
    this.resetPersonSelection();
    this.refreshParentOptions(null);
    const parentCode = parent ? String(parent['CodDistributionChannel']) : undefined;
    this.form = this.buildForm(undefined, parentCode);
    this.dialogVisible.set(true);
  }

  openEdit(row: CatalogRow): void {
    this.dialogMode.set('edit');
    this.editingRow = row;
    this.resetPersonSelection();
    const person = row['TPerson'] as Person | null | undefined;
    if (person) this.selectedPerson.set(person);
    this.refreshParentOptions(String(row['IdeDistributionChannel']));
    this.form = this.buildForm(row);
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
    const person = this.selectedPerson();

    if (this.dialogMode() === 'create') {
      const payload: Record<string, unknown> = {
        codDistributionChannel: raw.cod,
        desDistributionChannel: raw.des,
      };
      if (raw.codChannelType) payload['codChannelType'] = raw.codChannelType;
      if (raw.codParent) payload['codDistributionChannelParent'] = raw.codParent;
      if (raw.codBroker) payload['codBroker'] = raw.codBroker;
      if (person) payload['idePerson'] = person.IdePerson;
      if (raw.image.trim()) payload['image'] = raw.image.trim();
      this.catalogService.create(PATH, payload).subscribe({
        next: () => this.afterSave('catalogs.createdDetail', raw.des),
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    } else {
      // En edición se manda '' para vaciar cada relación opcional.
      const payload: Record<string, unknown> = {
        desDistributionChannel: raw.des,
        codChannelType: raw.codChannelType ?? '',
        codDistributionChannelParent: raw.codParent ?? '',
        codBroker: raw.codBroker ?? '',
        idePerson: person ? person.IdePerson : '',
        image: raw.image.trim(),
      };
      const id = String(this.editingRow!['IdeDistributionChannel']);
      this.catalogService.update(PATH, id, payload).subscribe({
        next: () => this.afterSave('catalogs.updatedDetail', raw.des),
        error: (err: HttpErrorResponse) => this.showError(err),
      });
    }
  }

  private afterSave(key: string, item: string): void {
    this.messages.add({
      severity: 'success',
      summary: this.transloco.translate('common.done'),
      detail: this.transloco.translate(key, { item }),
    });
    this.closeDialog();
    this.load();
  }

  toggleState(row: CatalogRow): void {
    const nextState = this.isActive(row) ? 'INACTIVO' : 'ACTIVO';
    const desc = String(row['DesDistributionChannel'] ?? '');
    this.confirm.confirm({
      header: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.activateHeader' : 'catalogs.deactivateHeader'),
      message: this.transloco.translate('catalogs.toggleConfirm', {
        action: this.transloco.translate(nextState === 'ACTIVO' ? 'catalogs.toggleActivateAction' : 'catalogs.toggleDeactivateAction'),
        item: desc,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const id = String(row['IdeDistributionChannel']);
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

  private errorToast(detailKey: string): void {
    this.messages.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(detailKey),
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
