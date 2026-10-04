import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService, TaskQueueRepository } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { BackgroundJobHandler, BackgroundJobRunResult } from '../background-jobs/background-job-handler.interface';
import { BackgroundJobsService } from '../background-jobs/background-jobs.service';

const DEFAULT_NOTICE_WINDOW_DAYS = 30;
const SYSTEM_ACTOR = 'job:AVISO_RENOVACION';

/**
 * Segundo caso real de `BackgroundJobHandler` (ver ese archivo) -- avisar al
 * cliente cuando su contrato está por entrar en su ventana de renovación.
 *
 * Desde 2026-10-03 este job YA NO envía nada: solo ENCOLA las tareas
 * `RENEWAL_NOTICE_EMAIL` (si el Titular tiene email) y `RENEWAL_NOTICE_SMS`
 * (si tiene celular principal activo) en la cola en segundo plano
 * (`TBackgroundTask`), que procesa el worker de `documents-service` con
 * reintentos y deja el resultado visible en la pantalla "Cola de tareas". El
 * contenido se arma al momento de enviar y, si para entonces el contrato ya
 * no está activo o se marcó "No renovar", el aviso se omite solo.
 *
 * Alcance (decidido con el usuario, 2026-10-01):
 * - Ventana: `RENEWAL_NOTICE_WINDOW_DAYS` días antes del vencimiento (default
 *   30), INDEPENDIENTE de la ventana de la pantalla "Renovaciones" (60 días).
 * - Destinatario: el Titular del contrato (`TPerson.DesEmail`; celular:
 *   `TContactData` `MOBILE_PHONE` principal activo).
 * - "Ya notificado": `TContract.TstRenewalNoticeSent` -- se fija al ENCOLAR (no
 *   al enviar) para que el job de mañana no vuelva a encolar lo mismo; si el
 *   envío falla, se reintenta desde la cola. `ContractsService.renew()` la
 *   limpia para que el próximo ciclo dispare un aviso nuevo.
 * - Link de "darme de baja de la renovación" dentro del correo: pendiente,
 *   decisión explícita del usuario.
 *
 * Mismo patrón que `RenewalBatchJobHandler`: se auto-registra contra
 * `BackgroundJobsService` en `onModuleInit`, uno por uno sin abortar el resto
 * si un contrato individual falla.
 */
@Injectable()
export class RenewalNoticeJobHandler implements BackgroundJobHandler, OnModuleInit {
  readonly codJob = 'AVISO_RENOVACION';
  readonly desJob = 'Aviso de renovación (correo y SMS)';

  private readonly logger = new Logger(RenewalNoticeJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly backgroundJobs: BackgroundJobsService,
    private readonly taskQueue: TaskQueueRepository,
  ) {}

  onModuleInit(): void {
    this.backgroundJobs.registerHandler(this);
  }

  async run(): Promise<BackgroundJobRunResult> {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const windowDays = Number(process.env.RENEWAL_NOTICE_WINDOW_DAYS ?? String(DEFAULT_NOTICE_WINDOW_DAYS));
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.tContract.findMany({
      where: {
        IdeState: ideActivo,
        IndNoRenovar: false,
        TstRenewalNoticeSent: null,
        TstEnd: { gte: now, lte: windowEnd },
      },
      include: {
        TContractPerson: {
          where: { SPersonRol: { CodPersonRol: 'TITULAR' } },
          include: { TPerson: { select: { IdePerson: true, DesEmail: true } } },
        },
      },
    });

    let numSucceeded = 0;
    let numSkipped = 0;
    let numFailed = 0;
    let numEmails = 0;
    let numSms = 0;

    for (const contract of candidates) {
      const titular = contract.TContractPerson[0]?.TPerson;
      try {
        const hasEmail = Boolean(titular?.DesEmail?.trim());
        const hasMobile = titular ? await this.hasMobile(titular.IdePerson) : false;
        if (!hasEmail && !hasMobile) {
          numSkipped++;
          this.logger.warn(
            `Contrato "${contract.NumContract}" sin Titular con email ni celular -- se salta el aviso de renovación`,
          );
          continue;
        }
        if (hasEmail) {
          await this.taskQueue.enqueue({
            codTaskType: 'RENEWAL_NOTICE_EMAIL',
            ideEntity: contract.IdeContract,
            actor: SYSTEM_ACTOR,
          });
          numEmails++;
        }
        if (hasMobile) {
          await this.taskQueue.enqueue({
            codTaskType: 'RENEWAL_NOTICE_SMS',
            ideEntity: contract.IdeContract,
            actor: SYSTEM_ACTOR,
          });
          numSms++;
        }
        await this.prisma.tContract.update({
          where: { IdeContract: contract.IdeContract },
          data: { TstRenewalNoticeSent: new Date() },
        });
        numSucceeded++;
      } catch (err) {
        numFailed++;
        this.logger.error(
          `No se pudo encolar el aviso de renovación del contrato "${contract.NumContract}" (${contract.IdeContract}): ${(err as Error).message}`,
        );
      }
    }

    return {
      numSucceeded,
      numFailed,
      numSkipped,
      desDetail: `${candidates.length} contrato(s) dentro de la ventana de aviso (${windowDays} día(s)): ${numSucceeded} con aviso encolado (${numEmails} correo(s), ${numSms} SMS), ${numSkipped} saltado(s) sin email ni celular, ${numFailed} fallido(s) al encolar. El envío real lo hace la cola (ver "Cola de tareas").`,
    };
  }

  private async hasMobile(idePerson: string): Promise<boolean> {
    const count = await this.prisma.tContactData.count({
      where: {
        IdePerson: idePerson,
        IndMain: true,
        SState: { CodState: 'ACTIVO' },
        SContactClass: { CodContactClass: 'MOBILE_PHONE' },
      },
    });
    return count > 0;
  }
}
