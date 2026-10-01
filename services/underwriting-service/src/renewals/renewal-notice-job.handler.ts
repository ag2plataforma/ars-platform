import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService, EMAIL_SENDER, EmailSender } from '@ars-platform/shared-common';
import { BackgroundJobHandler, BackgroundJobRunResult } from '../background-jobs/background-job-handler.interface';
import { BackgroundJobsService } from '../background-jobs/background-jobs.service';

const DEFAULT_NOTICE_WINDOW_DAYS = 30;

/**
 * Segundo caso real de `BackgroundJobHandler` (ver ese archivo) -- el
 * sub-item explícitamente pendiente de la Etapa 3 de "Gestión de
 * renovaciones" (ver docs/02-roadmap.md): avisar por email al cliente
 * cuando su contrato está por entrar en su ventana de renovación.
 *
 * Alcance decidido con el usuario (2026-10-01):
 * - Ventana: `RENEWAL_NOTICE_WINDOW_DAYS` días antes del vencimiento
 *   (default 30, mismo patrón de env var que `RENEWAL_CANDIDATE_WINDOW_DAYS`
 *   en `ContractsService.findRenewalCandidates`) -- deliberadamente
 *   INDEPENDIENTE de esa otra ventana (60 días, pantalla "Renovaciones"):
 *   un operador puede querer ver candidatos con más anticipación de la
 *   que el cliente necesita recibir el aviso.
 * - Destinatario: `TPerson.DesEmail` del Titular del contrato (columna
 *   única en `TPerson`, confirmada como la fuente real usada en todo el
 *   sistema -- `party-service`, cotizaciones, contratos -- `TContactData`
 *   solo se usa hoy para `MOBILE_PHONE`, nunca para email).
 * - "Ya notificado": nueva columna `TContract.TstRenewalNoticeSent`
 *   (nullable, ver `packages/database/scripts/setup-renewal-notice-column.js`)
 *   -- se filtra `IS NULL` acá, se fija a `now()` después de enviar, y
 *   `ContractsService.renew()` la vuelve a limpiar (`null`) para que el
 *   PRÓXIMO ciclo de renovación dispare un aviso nuevo.
 * - Link de "darme de baja de la renovación" dentro del correo:
 *   DELIBERADAMENTE NO IMPLEMENTADO todavía -- decisión explícita del
 *   usuario ("por ahora que ese link no haga nada, dejalo pendiente en
 *   el roadmap"). El correo es puramente informativo por ahora; el
 *   mecanismo de opt-out ya existe para el operador
 *   (`ContractsService.setRenewalOptOut`, pantalla "Renovaciones") pero
 *   el cliente todavía no tiene una vía propia de auto-servicio.
 *
 * Mismo patrón que `RenewalBatchJobHandler`: se auto-registra contra
 * `BackgroundJobsService` en `onModuleInit`, uno por uno sin abortar el
 * resto si un contrato individual falla.
 */
@Injectable()
export class RenewalNoticeJobHandler implements BackgroundJobHandler, OnModuleInit {
  readonly codJob = 'AVISO_RENOVACION';
  readonly desJob = 'Aviso de renovación por email';

  private readonly logger = new Logger(RenewalNoticeJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly backgroundJobs: BackgroundJobsService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
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
        SProduct: { select: { DesProduct: true } },
        TContractPerson: {
          where: { SPersonRol: { CodPersonRol: 'TITULAR' } },
          include: { TPerson: { select: { DesFirstName: true, DesLastName1: true, DesEmail: true } } },
        },
      },
    });

    let numSucceeded = 0;
    let numSkipped = 0;
    let numFailed = 0;

    for (const contract of candidates) {
      const titular = contract.TContractPerson[0]?.TPerson;
      if (!titular?.DesEmail) {
        numSkipped++;
        this.logger.warn(
          `Contrato "${contract.NumContract}" sin Titular/email resuelto -- se salta el aviso de renovación`,
        );
        continue;
      }
      try {
        const desTitular = [titular.DesFirstName, titular.DesLastName1].filter(Boolean).join(' ');
        const fechaVencimiento = contract.TstEnd!.toISOString().slice(0, 10);
        await this.emailSender.send({
          to: titular.DesEmail,
          subject: `Tu póliza ${contract.NumContract} está por renovarse — ARS Platform`,
          html: `
            <p>Hola ${desTitular || 'cliente'},</p>
            <p>Tu póliza <strong>${contract.NumContract}</strong> (${contract.SProduct.DesProduct}) vence el <strong>${fechaVencimiento}</strong> y se renovará automáticamente.</p>
            <p>Si tenés dudas o querés hacer algún cambio, contactá a tu asesor.</p>
          `,
        });
        await this.prisma.tContract.update({
          where: { IdeContract: contract.IdeContract },
          data: { TstRenewalNoticeSent: new Date() },
        });
        numSucceeded++;
      } catch (err) {
        numFailed++;
        this.logger.error(
          `No se pudo enviar el aviso de renovación del contrato "${contract.NumContract}" (${contract.IdeContract}): ${(err as Error).message}`,
        );
      }
    }

    return {
      numSucceeded,
      numFailed,
      numSkipped,
      desDetail: `${candidates.length} contrato(s) dentro de la ventana de aviso (${windowDays} día(s)): ${numSucceeded} aviso(s) enviado(s), ${numSkipped} saltado(s) por falta de email, ${numFailed} fallido(s).`,
    };
  }
}
