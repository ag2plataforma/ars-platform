import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BackgroundJobHandler, BackgroundJobRunResult } from '../background-jobs/background-job-handler.interface';
import { BackgroundJobsService } from '../background-jobs/background-jobs.service';
import { ContractsService } from '../contracts/contracts.service';

const DEFAULT_LEAD_DAYS = 10;

/**
 * Emisión programada de los recibos de las cuotas 2..N de los contratos
 * fraccionados (acordado con el usuario, 2026-10-04): cada corrida emite el
 * recibo de toda cuota cuyo período empiece dentro de los próximos
 * `RECEIPT_ISSUE_LEAD_DAYS` días (default 10) -- o que ya empezó, si el job
 * estuvo caído. Los productos con `IndGenerateAllFraction` emiten todos los
 * recibos al contratar, así que acá no tienen nada pendiente.
 *
 * La lógica vive en `ContractsService.issueDueInstallmentReceipts`; este
 * handler solo la dispara y reporta. El horario se administra en "Trabajos
 * Programados" (recomendado: una vez al día).
 */
@Injectable()
export class InstallmentReceiptJobHandler implements BackgroundJobHandler, OnModuleInit {
  readonly codJob = 'EMISION_RECIBOS_CUOTAS';
  readonly desJob = 'Emisión de recibos de cuotas';

  private readonly logger = new Logger(InstallmentReceiptJobHandler.name);

  constructor(
    private readonly contractsService: ContractsService,
    private readonly backgroundJobs: BackgroundJobsService,
  ) {}

  onModuleInit(): void {
    this.backgroundJobs.registerHandler(this);
  }

  async run(actor: string): Promise<BackgroundJobRunResult> {
    const leadDays = Number(process.env.RECEIPT_ISSUE_LEAD_DAYS ?? String(DEFAULT_LEAD_DAYS));
    const result = await this.contractsService.issueDueInstallmentReceipts(
      Number.isFinite(leadDays) && leadDays >= 0 ? leadDays : DEFAULT_LEAD_DAYS,
      actor,
    );
    for (const failure of result.failures) this.logger.warn(`Cuota no emitida -- ${failure}`);
    return {
      numSucceeded: result.numIssued,
      numFailed: result.numFailed,
      numSkipped: Math.max(result.numCandidates - result.numContracts - result.numFailed, 0),
      desDetail:
        `${result.numIssued} recibo(s) emitido(s) en ${result.numContracts} contrato(s) ` +
        `de ${result.numCandidates} fraccionado(s) activo(s)` +
        (result.failures.length ? `. Fallos: ${result.failures.slice(0, 5).join(' | ')}` : ''),
    };
  }
}
