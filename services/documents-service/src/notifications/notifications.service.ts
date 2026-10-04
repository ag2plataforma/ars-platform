import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import {
  EMAIL_SENDER,
  EmailSender,
  SMS_SENDER,
  SmsConfigError,
  SmsInvalidRecipientError,
  SmsSender,
} from '@ars-platform/shared-common';
import { PermanentTaskError } from '../queue/task-handler';

/** Resultado de un envío: o se envió, o se omitió con un motivo (la tarea
 *  queda COMPLETADA y el motivo visible en la vista global de la cola). */
export type NotificationResult = { sent: true; sentTo: string } | { sent: false; skipped: true; reason: string };

interface TitularContext {
  numContract: string;
  desProduct: string;
  tstEnd: Date | null;
  desTitular: string;
  email: string | null;
  mobile: string | null;
  isActive: boolean;
  indNoRenovar: boolean;
}

/**
 * Mensajes de la cola que NO generan documentos: SMS de bienvenida y aviso
 * de renovación (correo y SMS). Cada método se ejecuta desde un handler del
 * worker (`queue/handlers`) y arma el contenido AL MOMENTO de enviar, con los
 * datos vigentes del contrato -- por eso las tareas solo llevan el id del
 * contrato.
 *
 * Distinción de errores (la usa el worker): configuración o destinatario
 * inválido -> `PermanentTaskError` (FALLIDA directo, "Reintentar" a mano al
 * arreglarlo); proveedor caído / red -> error común (reintento automático).
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(SMS_SENDER) private readonly smsSender: SmsSender,
  ) {}

  async sendWelcomeSms(ideContract: string): Promise<NotificationResult> {
    const ctx = await this.loadContext(ideContract);
    if (!ctx.mobile) return { sent: false, skipped: true, reason: 'El Titular no tiene celular principal activo' };
    await this.sendSms(
      ctx.mobile,
      `ARS: ${ctx.desTitular ? ctx.desTitular + ', t' : 'T'}u poliza ${ctx.numContract} ya esta activa. Te enviamos los detalles por correo. Bienvenido!`,
    );
    return { sent: true, sentTo: ctx.mobile };
  }

  async sendRenewalNoticeEmail(ideContract: string): Promise<NotificationResult> {
    const ctx = await this.loadContext(ideContract);
    const stale = this.renewalSkipReason(ctx);
    if (stale) return { sent: false, skipped: true, reason: stale };
    if (!ctx.email) return { sent: false, skipped: true, reason: 'El Titular no tiene email' };
    await this.emailSender.send({
      to: ctx.email,
      subject: `Tu póliza ${ctx.numContract} está por renovarse — ARS Platform`,
      html: `
        <p>Hola ${ctx.desTitular || 'cliente'},</p>
        <p>Tu póliza <strong>${ctx.numContract}</strong> (${ctx.desProduct}) vence el <strong>${this.formatDate(ctx.tstEnd)}</strong> y se renovará automáticamente.</p>
        <p>Si tenés dudas o querés hacer algún cambio, contactá a tu asesor.</p>
      `,
    });
    return { sent: true, sentTo: ctx.email };
  }

  async sendRenewalNoticeSms(ideContract: string): Promise<NotificationResult> {
    const ctx = await this.loadContext(ideContract);
    const stale = this.renewalSkipReason(ctx);
    if (stale) return { sent: false, skipped: true, reason: stale };
    if (!ctx.mobile) return { sent: false, skipped: true, reason: 'El Titular no tiene celular principal activo' };
    await this.sendSms(
      ctx.mobile,
      `ARS: tu poliza ${ctx.numContract} vence el ${this.formatDate(ctx.tstEnd)} y se renovara automaticamente. Dudas? Contacta a tu asesor.`,
    );
    return { sent: true, sentTo: ctx.mobile };
  }

  /** Si entre el encolado y el envío el contrato dejó de estar activo o el
   *  cliente pidió no renovar, el aviso ya no corresponde. */
  private renewalSkipReason(ctx: TitularContext): string | null {
    if (!ctx.isActive) return 'El contrato ya no está activo';
    if (ctx.indNoRenovar) return 'El contrato está marcado como "No renovar"';
    return null;
  }

  private async sendSms(to: string, content: string): Promise<void> {
    try {
      await this.smsSender.send({ to, content });
    } catch (err) {
      if (err instanceof SmsConfigError || err instanceof SmsInvalidRecipientError) {
        throw new PermanentTaskError(err.message);
      }
      throw err;
    }
  }

  private async loadContext(ideContract: string): Promise<TitularContext> {
    const contract = await this.prisma.tContract.findUnique({
      where: { IdeContract: ideContract },
      include: {
        SProduct: { select: { DesProduct: true } },
        SState: { select: { CodState: true } },
        TContractPerson: {
          where: { SPersonRol: { CodPersonRol: 'TITULAR' } },
          include: { TPerson: { select: { IdePerson: true, DesFirstName: true, DesLastName1: true, DesEmail: true } } },
        },
      },
    });
    if (!contract) throw new PermanentTaskError(`No existe el contrato "${ideContract}"`);
    const titular = contract.TContractPerson[0]?.TPerson;
    if (!titular) throw new PermanentTaskError(`El contrato "${contract.NumContract}" no tiene Titular`);

    const mobile = await this.prisma.tContactData.findFirst({
      where: {
        IdePerson: titular.IdePerson,
        IndMain: true,
        SState: { CodState: 'ACTIVO' },
        SContactClass: { CodContactClass: 'MOBILE_PHONE' },
      },
      select: { DesContactData: true },
    });

    return {
      numContract: contract.NumContract,
      desProduct: contract.SProduct.DesProduct,
      tstEnd: contract.TstEnd,
      desTitular: [titular.DesFirstName, titular.DesLastName1].filter(Boolean).join(' '),
      email: titular.DesEmail?.trim() || null,
      mobile: mobile?.DesContactData?.trim() || null,
      isActive: ['ACTIVO', 'Activo'].includes(contract.SState.CodState),
      indNoRenovar: contract.IndNoRenovar,
    };
  }

  private formatDate(date: Date | null): string {
    return date ? date.toISOString().slice(0, 10) : '—';
  }
}
