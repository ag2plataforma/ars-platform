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

  /**
   * Correo con el enlace de pago (encolado por `PaymentLinksService.createAndSend`
   * al elegir "Enviar landing de pago" en el popup "Activar"). Si entre el
   * encolado y el envío el enlace se canceló, venció o ya se pagó, se omite.
   */
  async sendPaymentLinkEmail(ideContract: string, payload: Record<string, unknown>): Promise<NotificationResult> {
    const ideLink = typeof payload['ideLink'] === 'string' ? payload['ideLink'] : null;
    const url = typeof payload['url'] === 'string' ? payload['url'] : null;
    if (!ideLink || !url) throw new PermanentTaskError('La tarea no trae el enlace de pago (ideLink/url)');

    const rows = await this.prisma.$queryRaw<
      Array<{ CodStatus: string; DesEmail: string | null; TstExpires: Date; IdePerson: string | null }>
    >`
      SELECT "CodStatus", "DesEmail", "TstExpires", "IdePerson"
        FROM ars_platform."TPaymentLink" WHERE "IdePaymentLink" = ${ideLink}::uuid`;
    const link = rows[0];
    if (!link) throw new PermanentTaskError(`No existe el enlace de pago "${ideLink}"`);
    if (!['ENVIADO', 'ABIERTO', 'CONSENTIDO'].includes(link.CodStatus) || link.TstExpires.getTime() < Date.now()) {
      return { sent: false, skipped: true, reason: `El enlace de pago ya no está vigente (${link.CodStatus})` };
    }
    if (!link.DesEmail) throw new PermanentTaskError('El enlace de pago no tiene correo de destino');

    const contract = await this.prisma.tContract.findUnique({
      where: { IdeContract: ideContract },
      select: { NumContract: true, SProduct: { select: { DesProduct: true } } },
    });
    if (!contract) throw new PermanentTaskError(`No existe el contrato "${ideContract}"`);
    const person = link.IdePerson
      ? await this.prisma.tPerson.findUnique({
          where: { IdePerson: link.IdePerson },
          select: { DesFirstName: true, DesLastName1: true },
        })
      : null;
    const name = person ? [person.DesFirstName, person.DesLastName1].filter(Boolean).join(' ') : '';

    await this.emailSender.send({
      to: link.DesEmail,
      subject: `Completa el pago de tu póliza ${contract.NumContract} — ARS Platform`,
      html: `
        <p>Hola ${name || 'cliente'},</p>
        <p>Tu póliza <strong>${contract.NumContract}</strong> (${contract.SProduct.DesProduct}) está lista para activarse.</p>
        <p>Para activarla, revisa y acepta las condiciones y realiza el pago desde este enlace seguro:</p>
        <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#0369a1;color:#ffffff;border-radius:6px;text-decoration:none">Ir al pago</a></p>
        <p style="color:#64748b;font-size:12px">El enlace es personal y vence el ${this.formatDate(link.TstExpires)}. Si no esperabas este correo, ignóralo.</p>
      `,
    });
    return { sent: true, sentTo: link.DesEmail };
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
