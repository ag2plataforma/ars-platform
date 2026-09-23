import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule, TableRowSelectEvent } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RiskAttributesService } from '../quotes/risk-attributes.service';
import {
  ContractDetail,
  ContractFile,
  ContractOperation,
  ContractRequirement,
  ContractRisk,
  ContractsService,
} from './contracts.service';

/** Un requisito ya "aplanado" con el riesgo al que pertenece, para la
 *  pestaña "Requisitos" (Nivel 1, sin selección previa -- ver el
 *  comentario de cabecera de la clase). */
interface RequirementRow {
  riskLabel: string;
  requirement: ContractRequirement;
}

/**
 * Detalle de un contrato puntual (`GET /contracts/:id`).
 *
 * Reestructurada el 23/09/2026 a pedido explícito del usuario ("mini
 * core de seguros... me gustaria mantener la estructura del antiguo
 * backoffice") como un árbol de pestañas de 3 niveles que se van
 * habilitando a medida que se selecciona una fila, calcado del diálogo
 * `pages/contract` del backoffice viejo (`[disabled]="disabledFileRisk"`/
 * `[disabled]="disabledRiskCoverage"`):
 *
 *   Nivel 1 (siempre habilitadas): Tomador/Titular, Certificados,
 *   Movimientos (con popup de Recibos por movimiento), Canales de
 *   distribución, Requisitos.
 *   Nivel 2 "Riesgos": deshabilitada hasta seleccionar un Certificado
 *   (`TContractFile`) en la pestaña Certificados.
 *   Nivel 3 "Coberturas": deshabilitada hasta seleccionar un Riesgo
 *   (`TFileRisk`) en la pestaña Riesgos.
 *
 * Diferencia deliberada frente al sistema viejo, tal como lo pidió el
 * usuario: "Movimientos" y "Requisitos" son Nivel 1 acá (siempre
 * habilitadas), no dependen de seleccionar un archivo/riesgo primero.
 *
 * La info general del contrato (número, producto, vigencia, forma de
 * pago, estado) ya no es una pestaña propia -- el usuario no la incluyó
 * en su lista de pestañas -- se muestra como una franja compacta arriba
 * de las pestañas.
 *
 * Selección de fila = navegación: al seleccionar un Certificado se
 * habilita Y se pasa automáticamente a la pestaña Riesgos (mismo
 * criterio para Riesgo -> Coberturas); es una decisión de UX no
 * explícitamente pedida (el usuario dijo "activar", no "navegar"), pero
 * ahorra un clic y es el patrón esperado en un drill-down -- fácil de
 * revertir si no gusta en pantalla.
 *
 * Preparada para lo que sigue en el roadmap (modificaciones/suplementos
 * de póliza): la pestaña "Movimientos" ya lista `TContractOperation` en
 * orden (`NumOperation` asc) con su tipo real -- el día que se
 * implementen endosos, cada uno aparece ahí como una operación más, sin
 * cambiar la estructura de esta pantalla.
 */
@Component({
  selector: 'app-contract-detail',
  standalone: true,
  imports: [CommonModule, ButtonModule, DialogModule, TableModule, TabsModule, TagModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  templateUrl: './contract-detail.component.html',
})
export class ContractDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly contracts = inject(ContractsService);
  private readonly riskAttributes = inject(RiskAttributesService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly contract = signal<ContractDetail | null>(null);
  readonly loading = signal(false);
  readonly activeTab = signal<string | number>('personas');

  /** Certificado (`TContractFile`) seleccionado en la pestaña
   *  Certificados -- habilita y alimenta la pestaña "Riesgos". */
  readonly selectedFile = signal<ContractFile | null>(null);
  /** Riesgo (`TFileRisk`) seleccionado en la pestaña Riesgos -- habilita
   *  y alimenta la pestaña "Coberturas". */
  readonly selectedRisk = signal<ContractRisk | null>(null);

  readonly risksDisabled = computed(() => this.selectedFile() === null);
  readonly coveragesDisabled = computed(() => this.selectedRisk() === null);
  readonly selectedFileRisks = computed(() => this.selectedFile()?.TFileRisk ?? []);
  readonly selectedRiskCoverages = computed(() => this.selectedRisk()?.TRiskCoverage ?? []);

  /** Requisitos de todos los riesgos, aplanados con el nombre del
   *  riesgo -- "Requisitos" es Nivel 1 (no depende de seleccionar un
   *  certificado/riesgo primero), así que se muestran todos juntos. */
  readonly requirementRows = computed<RequirementRow[]>(() => {
    const files = this.contract()?.TContractFile ?? [];
    const rows: RequirementRow[] = [];
    for (const file of files) {
      for (const risk of file.TFileRisk) {
        const riskLabel = risk.DesFileRisk ?? risk.SRiskProduct.DesShort ?? '';
        for (const requirement of risk.TContractRequirement) {
          rows.push({ riskLabel, requirement });
        }
      }
    }
    return rows;
  });

  /** Movimiento (`TContractOperation`) seleccionado -- alimenta el popup
   *  de Recibos. */
  readonly selectedOperation = signal<ContractOperation | null>(null);
  readonly receiptsDialogVisible = signal(false);
  readonly selectedOperationReceipts = computed(() => {
    const op = this.selectedOperation();
    if (!op) return [];
    return this.contract()?.TReceipt.filter((r) => r.IdeContractOperation === op.IdeContractOperation) ?? [];
  });

  /** Popup "atributos personalizados" de un riesgo -- resuelve
   *  `TFileRisk.RiskAttributeValue` (`{ IdeAttributeProperty: valor }`)
   *  contra el schema real (`RiskAttributesService.getSchema`, el mismo
   *  que arma el formulario dinámico en la Etapa 1 de Cotización) para
   *  mostrar etiquetas y opciones legibles en vez del JSON crudo. */
  readonly attributesDialogVisible = signal(false);
  readonly attributesDialogLoading = signal(false);
  readonly attributesDialogFields = signal<Array<{ label: string; value: string }>>([]);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.load(id);
      }
    });
  }

  private load(ideContract: string): void {
    this.loading.set(true);
    this.contracts.getContract(ideContract).subscribe({
      next: (result) => {
        this.contract.set(result);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const detail =
          (err.error && typeof err.error === 'object' && 'message' in err.error
            ? String((err.error as { message: unknown }).message)
            : null) ?? this.transloco.translate<string>('common.unexpectedError');
        this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
      },
    });
  }

  onFileSelect(event: TableRowSelectEvent): void {
    const file = event.data as ContractFile;
    this.selectedFile.set(file);
    this.selectedRisk.set(null);
    this.activeTab.set('riesgos');
  }

  onRiskSelect(event: TableRowSelectEvent): void {
    const risk = event.data as ContractRisk;
    this.selectedRisk.set(risk);
    this.activeTab.set('coberturas');
  }

  onOperationSelect(event: TableRowSelectEvent): void {
    this.selectedOperation.set(event.data as ContractOperation);
    this.receiptsDialogVisible.set(true);
  }

  closeReceiptsDialog(): void {
    this.receiptsDialogVisible.set(false);
  }

  openAttributesDialog(risk: ContractRisk): void {
    this.attributesDialogVisible.set(true);
    this.attributesDialogLoading.set(true);
    this.attributesDialogFields.set([]);
    this.riskAttributes.getSchema(risk.SRiskProduct.IdeRiskProduct).subscribe({
      next: (schema) => {
        const raw = risk.RiskAttributeValue ?? {};
        const fields = schema.fields.map((field) => {
          const rawValue = (raw as Record<string, unknown>)[field.ideAttributeProperty];
          const option = field.options?.find((o) => String(o.value) === String(rawValue));
          const value = option ? option.key : rawValue !== undefined && rawValue !== null ? String(rawValue) : this.transloco.translate<string>('common.dash');
          return { label: field.label, value };
        });
        this.attributesDialogFields.set(fields);
        this.attributesDialogLoading.set(false);
      },
      error: () => {
        this.attributesDialogLoading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate<string>('common.unexpectedError'),
        });
      },
    });
  }

  closeAttributesDialog(): void {
    this.attributesDialogVisible.set(false);
  }

  stateSeverity(codState: string): 'info' | 'warn' | 'success' | 'secondary' {
    switch (codState) {
      case 'ACTIVO':
        return 'success';
      case 'SEED_ANULADO':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  volver(): void {
    this.router.navigate(['/contratos']);
  }
}
