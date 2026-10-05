import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma, PrismaService, TaskQueueRepository } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { PaymentsService } from './payments.service';

export const PAYMENT_LINK_EMAIL_TASK = 'PAYMENT_LINK_EMAIL';
export const ACTIVE_LINK_STATUSES = ['ENVIADO', 'ABIERTO', 'CONSENTIDO'] as const;
const DEFAULT_TTL_DAYS = 7;

export type PaymentLinkStatus = 'ENVIADO' | 'ABIERTO' | 'CONSENTIDO' | 'PAGADO' | 'VENCIDO' | 'CANCELADO';

/** Fila de `TPaymentLink` (sin el hash del token). */
export interface PaymentLinkRow {
  IdePaymentLink: string;
  IdeContract: string;
  IdeReceipt: string;
  IdePerson: string | null;
  DesEmail: string | null;
  CodStatus: PaymentLinkStatus;
  TstExpires: Date;
  TstSent: Date | null;
  TstOpened: Date | null;
  TstConsented: Date | null;
  TstPaid: Date | null;
  UsrCreation: string;
  TstCreation: Date;
}

const COLUMNS = Prisma.raw(`"IdePaymentLink", "IdeContract", "IdeReceipt", "IdePerson", "DesEmail", "CodStatus",
  "TstExpires", "TstSent", "TstOpened", "TstConsented", "TstPaid", "UsrCreation", "TstCreation"`);

/** Base de la URL pública del frontend (landing de pago). */
export function publicAppUrl(): string {
  return (process.env.PUBLIC_APP_URL ?? 'http://localhost:4200').replace(/\/$/, '');
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Enlaces de pago (`TPaymentLink`, ver `setup-payment-links.js`): lo que el
 * operador envía al tomador al elegir "Enviar landing de pago" en el popup
 * "Activar". Acá vive el ciclo de vida del enlace; la landing pública (ver
 * `PaymentLandingService`) y el webhook de la pasarela lo consumen.
 *
 * Solo se guarda el SHA-256 del token; el token en claro solo existe en la
 * URL del correo (y en el payload de la tarea de correo en la cola).
 */
@Injectable()
export class PaymentLinksService {
  private readonly logger = new Logger(PaymentLinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly taskQueue: TaskQueueRepository,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Crea un enlace nuevo (cancelando los vigentes del contrato) y encola el
   * correo al Tomador (o al Titular si no hay Tomador). El contrato debe
   * seguir en su estado inicial (Borrador).
   */
  async createAndSend(ideContract: string, actor: string): Promise<PaymentLinkRow> {
    const contract = await this.prisma.tContract.findUnique({
      where: { IdeContract: ideContract },
      select: { IdeContract: true, NumContract: true, IdeState: true },
    });
    if (!contract) throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    const ideBorrador = await this.stateMachine.getInitialState('TContract');
    if (contract.IdeState !== ideBorrador) {
      throw new ConflictException(`El contrato "${contract.NumContract}" no está en estado "Borrador"`);
    }

    const payer = await this.findPayer(ideContract);
    const email = payer?.TPerson.DesEmail?.trim();
    if (!payer || !email) {
      throw new ConflictException('El tomador del contrato no tiene correo electrónico: no se puede enviar el enlace de pago');
    }

    const { receipts } = await this.payments.findFirstReceiptGroup(ideContract);
    const token = randomBytes(32).toString('base64url');
    const ttlDays = Number(process.env.PAYMENT_LINK_TTL_DAYS ?? String(DEFAULT_TTL_DAYS));
    const now = new Date();
    const expires = new Date(now.getTime() + (Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : DEFAULT_TTL_DAYS) * 86_400_000);

    const ideLink = await this.prisma.$transaction(async (tx) => {
      await this.cancelActiveTx(ideContract, actor, tx);
      const rows = await tx.$queryRaw<{ IdePaymentLink: string }[]>`
        INSERT INTO ars_platform."TPaymentLink"
          ("IdeContract", "IdeReceipt", "IdePerson", "DesEmail", "DesTokenHash", "CodStatus", "TstExpires", "TstSent",
           "UsrCreation", "TstCreation", "UsrModification", "TstModification")
        VALUES
          (${ideContract}::uuid, ${receipts[0].IdeReceipt}::uuid, ${payer.IdePerson}::uuid, ${email}, ${hashToken(token)},
           'ENVIADO', ${expires}, ${now}, ${actor}, ${now}, ${actor}, ${now})
        RETURNING "IdePaymentLink"`;
      return rows[0].IdePaymentLink;
    });

    try {
      await this.taskQueue.enqueue({
        codTaskType: PAYMENT_LINK_EMAIL_TASK,
        ideEntity: ideContract,
        payload: { ideLink, url: `${publicAppUrl()}/pago/${token}` },
        actor,
      });
    } catch (err) {
      // Sin correo en cola el enlace no sirve: se cancela para no dejar uno huérfano.
      await this.cancelActive(ideContract, actor);
      this.logger.error(`No se pudo encolar el correo del enlace de pago de "${contract.NumContract}": ${(err as Error).message}`);
      throw err;
    }
    return (await this.getLatest(ideContract))!;
  }

  /** Cancela los enlaces vigentes del contrato (devuelve cuántos). */
  async cancelActive(ideContract: string, actor: string): Promise<number> {
    return this.cancelActiveTx(ideContract, actor, this.prisma);
  }

  private cancelActiveTx(ideContract: string, actor: string, tx: Prisma.TransactionClient): Promise<number> {
    const now = new Date();
    return tx.$executeRaw`
      UPDATE ars_platform."TPaymentLink"
         SET "CodStatus" = 'CANCELADO', "UsrModification" = ${actor}, "TstModification" = ${now}
       WHERE "IdeContract" = ${ideContract}::uuid AND "CodStatus" IN ('ENVIADO', 'ABIERTO', 'CONSENTIDO')`;
  }

  /** Último enlace del contrato, con el estado EFECTIVO (vencido si ya pasó su fecha). */
  async getLatest(ideContract: string, tx: Prisma.TransactionClient = this.prisma): Promise<PaymentLinkRow | null> {
    const rows = await tx.$queryRaw<PaymentLinkRow[]>`
      SELECT ${COLUMNS} FROM ars_platform."TPaymentLink"
       WHERE "IdeContract" = ${ideContract}::uuid
       ORDER BY "TstCreation" DESC LIMIT 1`;
    return rows.length ? this.withEffectiveStatus(rows[0]) : null;
  }

  /** Relee un enlace por su id (con el estado efectivo, VENCIDO incluido). */
  async getById(ideLink: string): Promise<PaymentLinkRow | null> {
    const rows = await this.prisma.$queryRaw<PaymentLinkRow[]>`
      SELECT ${COLUMNS} FROM ars_platform."TPaymentLink" WHERE "IdePaymentLink" = ${ideLink}::uuid`;
    return rows.length ? this.withEffectiveStatus(rows[0]) : null;
  }

  /** Busca el enlace por su token; marca VENCIDO si corresponde. Lanza 404 si no existe. */
  async resolveByToken(token: string): Promise<PaymentLinkRow> {
    if (!token || token.length < 20 || token.length > 200) throw new NotFoundException('Enlace no válido');
    const rows = await this.prisma.$queryRaw<PaymentLinkRow[]>`
      SELECT ${COLUMNS} FROM ars_platform."TPaymentLink" WHERE "DesTokenHash" = ${hashToken(token)}`;
    if (!rows.length) throw new NotFoundException('Enlace no válido');
    const link = this.withEffectiveStatus(rows[0]);
    if (link.CodStatus === 'VENCIDO' && rows[0].CodStatus !== 'VENCIDO') {
      await this.setStatus(link.IdePaymentLink, 'VENCIDO', 'system');
    }
    return link;
  }

  async setStatus(
    ideLink: string,
    status: PaymentLinkStatus,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const now = new Date();
    await tx.$executeRaw`
      UPDATE ars_platform."TPaymentLink"
         SET "CodStatus" = ${status},
             "TstOpened" = CASE WHEN ${status} = 'ABIERTO' AND "TstOpened" IS NULL THEN ${now} ELSE "TstOpened" END,
             "TstConsented" = CASE WHEN ${status} = 'CONSENTIDO' THEN ${now} ELSE "TstConsented" END,
             "TstPaid" = CASE WHEN ${status} = 'PAGADO' THEN ${now} ELSE "TstPaid" END,
             "UsrModification" = ${actor}, "TstModification" = ${now}
       WHERE "IdePaymentLink" = ${ideLink}::uuid`;
  }

  private withEffectiveStatus(row: PaymentLinkRow): PaymentLinkRow {
    const active = (ACTIVE_LINK_STATUSES as readonly string[]).includes(row.CodStatus);
    return active && row.TstExpires.getTime() < Date.now() ? { ...row, CodStatus: 'VENCIDO' } : row;
  }

  private findPayer(ideContract: string) {
    return this.prisma.tContractPerson
      .findMany({
        where: { IdeContract: ideContract, SPersonRol: { CodPersonRol: { in: ['TOMADOR', 'TITULAR'] } } },
        include: {
          SPersonRol: { select: { CodPersonRol: true } },
          TPerson: { select: { IdePerson: true, DesEmail: true, DesFirstName: true, DesLastName1: true } },
        },
      })
      .then((rows) => rows.find((r) => r.SPersonRol.CodPersonRol === 'TOMADOR') ?? rows[0] ?? null);
  }
}
