import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { ContractsService } from '../contracts/contracts.service';
import { PaymentEvent } from '../payments/gateway/payment-gateway';
import { PaymentLinksService } from '../payments/payment-links.service';

interface PendingPaymentRow {
  IdePayment: string;
  IdeContract: string;
  IdePaymentLink: string | null;
  Amount: string;
  CodStatus: string;
}

export type PaymentEventResult =
  | { processed: true }
  | { processed: false; reason: 'UNKNOWN_PAYMENT' | 'ALREADY_PROCESSED' | 'AMOUNT_MISMATCH' | 'CONTRACT_NOT_PENDING' };

/**
 * Procesa los eventos YA NORMALIZADOS de la pasarela (webhook). Es lo ÚNICO
 * que activa un contrato por pago -- nunca el regreso del navegador a la
 * landing -- y es idempotente: la pasarela puede reenviar el mismo evento.
 */
@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger(PaymentEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly contracts: ContractsService,
    private readonly links: PaymentLinksService,
  ) {}

  async handle(event: PaymentEvent): Promise<PaymentEventResult> {
    const rows = await this.prisma.$queryRaw<PendingPaymentRow[]>`
      SELECT "IdePayment", "IdeContract", "IdePaymentLink", "Amount"::text AS "Amount", "CodStatus"
        FROM ars_platform."TPayment"
       WHERE "CodProvider" = ${event.codProvider} AND "DesExternalId" = ${event.externalId}`;
    const payment = rows[0];
    if (!payment) {
      this.logger.warn(`Evento ${event.type} de ${event.codProvider} para un pago desconocido (${event.externalId})`);
      return { processed: false, reason: 'UNKNOWN_PAYMENT' };
    }
    if (payment.CodStatus !== 'PENDIENTE') return { processed: false, reason: 'ALREADY_PROCESSED' };

    const actor = `pasarela:${event.codProvider}`;
    if (event.type === 'FAILED') {
      await this.setPaymentStatus(payment.IdePayment, 'FALLIDO', event.payload, actor);
      return { processed: true };
    }

    if (event.amount != null && Math.abs(event.amount - Number(payment.Amount)) > 0.009) {
      this.logger.error(
        `Importe distinto en ${event.externalId}: la pasarela cobró ${event.amount}, se esperaba ${payment.Amount}`,
      );
      await this.setPaymentStatus(payment.IdePayment, 'FALLIDO', { ...event.payload, amountMismatch: event.amount }, actor);
      return { processed: false, reason: 'AMOUNT_MISMATCH' };
    }

    const contract = await this.prisma.tContract.findUniqueOrThrow({
      where: { IdeContract: payment.IdeContract },
      select: { IdeState: true, NumContract: true },
    });
    const ideBorrador = await this.stateMachine.getInitialState('TContract');
    if (contract.IdeState !== ideBorrador) {
      // Llegó un pago de un contrato que ya no está en Borrador (p. ej. el
      // operador lo activó a mano mientras el cliente pagaba): se registra el
      // cobro pero NO se toca el contrato; hay que revisar un posible reembolso.
      this.logger.error(
        `Pago ${event.externalId} recibido en el contrato ${contract.NumContract}, que ya no está en Borrador: revisar reembolso`,
      );
      await this.setPaymentStatus(
        payment.IdePayment,
        'COBRADO',
        { ...event.payload, warning: 'contrato ya activado: revisar posible reembolso' },
        actor,
      );
      if (payment.IdePaymentLink) await this.links.setStatus(payment.IdePaymentLink, 'PAGADO', actor);
      return { processed: false, reason: 'CONTRACT_NOT_PENDING' };
    }

    await this.contracts.activateWithPayment(
      payment.IdeContract,
      { codProvider: event.codProvider, externalId: event.externalId, payload: event.payload },
      actor,
      async (tx) => {
        if (payment.IdePaymentLink) await this.links.setStatus(payment.IdePaymentLink, 'PAGADO', actor, tx);
      },
    );
    return { processed: true };
  }

  private async setPaymentStatus(
    idePayment: string,
    status: 'COBRADO' | 'FALLIDO',
    payload: Record<string, unknown>,
    actor: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$executeRaw`
      UPDATE ars_platform."TPayment"
         SET "CodStatus" = ${status}, "DesPayload" = ${JSON.stringify(payload)}::jsonb,
             "TstPaid" = CASE WHEN ${status} = 'COBRADO' THEN ${now} ELSE "TstPaid" END,
             "UsrModification" = ${actor}, "TstModification" = ${now}
       WHERE "IdePayment" = ${idePayment}::uuid`;
  }
}
