import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { BackgroundJobHandler, BackgroundJobRunResult } from '../background-jobs/background-job-handler.interface';
import { BackgroundJobsService } from '../background-jobs/background-jobs.service';
import { ContractsService } from '../contracts/contracts.service';

/**
 * Primer caso real de `BackgroundJobHandler` (ver ese archivo) -- Etapa 3
 * de "Gestión de renovaciones" (ver docs/02-roadmap.md): el disparo
 * AUTOMÁTICO de `ContractsService.renew()` sobre los contratos que ya
 * vencieron, respetando `TContract.IndNoRenovar` (Etapa 2).
 *
 * Se auto-registra contra `BackgroundJobsService` en `onModuleInit` --
 * el horario/activo/historial los administra la infraestructura
 * genérica (`BackgroundJobsService`/pantalla "Trabajos Programados"),
 * acá solo vive la lógica propia de qué hace UNA corrida.
 */
@Injectable()
export class RenewalBatchJobHandler implements BackgroundJobHandler, OnModuleInit {
  readonly codJob = 'RENOVACION_AUTOMATICA';
  readonly desJob = 'Renovación automática de contratos';

  private readonly logger = new Logger(RenewalBatchJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly contractsService: ContractsService,
    private readonly backgroundJobs: BackgroundJobsService,
  ) {}

  onModuleInit(): void {
    this.backgroundJobs.registerHandler(this);
  }

  /**
   * Busca contratos Activos ya vencidos (`TstEnd <= ahora`) que NO estén
   * marcados `IndNoRenovar`, y llama `ContractsService.renew()` por cada
   * uno -- UNO POR UNO, sin abortar el resto si alguno falla (un
   * contrato con datos inconsistentes no debería bloquear la renovación
   * de los demás).
   */
  async run(actor: string): Promise<BackgroundJobRunResult> {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const dueContracts = await this.prisma.tContract.findMany({
      where: { IdeState: ideActivo, TstEnd: { lte: now } },
      select: { IdeContract: true, NumContract: true, IndNoRenovar: true },
    });

    let numSucceeded = 0;
    let numSkipped = 0;
    let numFailed = 0;

    for (const contract of dueContracts) {
      if (contract.IndNoRenovar) {
        numSkipped++;
        continue;
      }
      try {
        await this.contractsService.renew(contract.IdeContract, actor);
        numSucceeded++;
      } catch (err) {
        numFailed++;
        this.logger.error(
          `No se pudo renovar el contrato "${contract.NumContract}" (${contract.IdeContract}) en el batch: ${(err as Error).message}`,
        );
      }
    }

    return {
      numSucceeded,
      numFailed,
      numSkipped,
      desDetail: `${dueContracts.length} contrato(s) vencido(s) encontrado(s): ${numSucceeded} renovado(s), ${numSkipped} saltado(s) por "No renovar", ${numFailed} fallido(s).`,
    };
  }
}
