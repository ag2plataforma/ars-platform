import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { PAYMENT_GATEWAY, PaymentGateway } from '../payments/gateway/payment-gateway';
import { ACTIVE_LINK_STATUSES, PaymentLinkRow, PaymentLinksService, publicAppUrl } from '../payments/payment-links.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentEventsService } from './payment-events.service';

interface ApplicableConsentRow {
  IdeConsent: string;
  DesConsent: string;
  DesConsentContent: Record<string, unknown> | null;
  IndMandatory: boolean;
  NumOrder: number;
}

export interface LandingConsent {
  ideConsent: string;
  title: string;
  text: string;
  url: string | null;
  mandatory: boolean;
  accepted: boolean;
}

/**
 * Lógica de la landing PÚBLICA de pago (sin JWT: el acceso lo da el token del
 * enlace, ver `PaymentLinksService`). Tres pasos: ver el resumen (`getView`),
 * aceptar los consentimientos configurados en el producto (`acceptConsents`)
 * y pasar a la pasarela (`startCheckout`).
 */
@Injectable()
export class PaymentLandingService {
  private readonly logger = new Logger(PaymentLandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly links: PaymentLinksService,
    private readonly payments: PaymentsService,
    private readonly events: PaymentEventsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async getView(token: string) {
    let link = await this.links.resolveByToken(token);
    if (this.isActive(link)) link = await this.reconcilePending(link);
    const contract = await this.loadContract(link.IdeContract);

    if (link.CodStatus === 'ENVIADO') {
      await this.links.setStatus(link.IdePaymentLink, 'ABIERTO', 'landing');
      link = { ...link, CodStatus: 'ABIERTO' };
    }
    const base = { status: link.CodStatus, expiresAt: link.TstExpires, numContract: contract.numContract };
    if (!this.isActive(link)) return base;

    const { receipts, codCurrency, symbolCurrency } = await this.payments.findFirstReceiptGroup(link.IdeContract);
    const amount = receipts.reduce((sum, r) => sum + Number(r.Prime), 0);
    const consents = await this.listConsents(link, contract.ideProduct);
    return {
      ...base,
      contract: {
        desProduct: contract.desProduct,
        tstInitial: contract.tstInitial,
        tstEnd: contract.tstEnd,
        desPayer: contract.desPayer,
        numFraction: contract.numFraction,
      },
      payment: { amount: Math.round(amount * 100) / 100, currency: codCurrency, symbol: symbolCurrency },
      consents,
      canPay: consents.filter((c) => c.mandatory).every((c) => c.accepted),
    };
  }

  async acceptConsents(token: string, ideConsents: string[], ip: string | null, userAgent: string | null) {
    const link = await this.requireActive(token);
    const contract = await this.loadContract(link.IdeContract);
    if (!link.IdePerson) throw new ConflictException('El enlace no tiene una persona asociada');

    const applicable = await this.applicableConsents(contract.ideProduct);
    const accepted = new Set(ideConsents);
    const missing = applicable.filter((c) => c.IndMandatory && !accepted.has(c.IdeConsent));
    if (missing.length > 0) {
      throw new BadRequestException(`Faltan consentimientos obligatorios: ${missing.map((c) => c.DesConsent).join(', ')}`);
    }

    const ideActivo = await this.stateMachine.getStateByCode('ACTIVO');
    const quote = await this.prisma.tContract.findUniqueOrThrow({
      where: { IdeContract: link.IdeContract },
      select: { IdeQuote: true },
    });
    const now = new Date();
    for (const consent of applicable.filter((c) => accepted.has(c.IdeConsent))) {
      const view = this.toView(consent, false);
      const snapshot = JSON.stringify({ title: view.title, text: view.text, url: view.url, mandatory: view.mandatory });
      // Idempotente por enlace + consentimiento: aceptar dos veces no duplica.
      await this.prisma.$executeRaw`
        INSERT INTO ars_platform."TPersonConsent"
          ("IdeConsent", "IdePerson", "IdeQuote", "IdeState", "IdePaymentLink", "TstAccepted", "DesIp", "DesUserAgent",
           "DesConsentSnapshot", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
        SELECT ${consent.IdeConsent}::uuid, ${link.IdePerson}::uuid, ${quote.IdeQuote}::uuid, ${ideActivo}::uuid,
               ${link.IdePaymentLink}::uuid, ${now}, ${ip}, ${userAgent}, ${snapshot}::jsonb,
               'landing-pago', ${now}, 'landing-pago', ${now}
         WHERE NOT EXISTS (
           SELECT 1 FROM ars_platform."TPersonConsent"
            WHERE "IdePaymentLink" = ${link.IdePaymentLink}::uuid AND "IdeConsent" = ${consent.IdeConsent}::uuid)`;
    }
    await this.links.setStatus(link.IdePaymentLink, 'CONSENTIDO', 'landing');
    return { status: 'CONSENTIDO' as const };
  }

  /** Crea la sesión en la pasarela (solo si los consentimientos obligatorios ya están registrados). */
  async startCheckout(token: string) {
    const link = await this.requireActive(token);
    const contract = await this.loadContract(link.IdeContract);
    const consents = await this.listConsents(link, contract.ideProduct);
    if (!consents.filter((c) => c.mandatory).every((c) => c.accepted)) {
      throw new ConflictException('Debes aceptar los consentimientos obligatorios antes de pagar');
    }

    const { receipts, codCurrency } = await this.payments.findFirstReceiptGroup(link.IdeContract);
    const amount = Math.round(receipts.reduce((sum, r) => sum + Number(r.Prime), 0) * 100) / 100;
    const session = await this.gateway.createCheckoutSession({
      ideLink: link.IdePaymentLink,
      ideContract: link.IdeContract,
      amount,
      currency: codCurrency,
      description: `Póliza ${contract.numContract} — ${contract.desProduct}`,
      customerEmail: link.DesEmail,
      returnUrl: `${publicAppUrl()}/pago/${token}`,
    });

    const now = new Date();
    await this.prisma.$executeRaw`
      INSERT INTO ars_platform."TPayment"
        ("IdeReceipt", "IdeContract", "Amount", "CodCurrency", "CodMethod", "CodProvider", "CodStatus",
         "DesExternalId", "IdePaymentLink", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
      VALUES
        (${receipts[0].IdeReceipt}::uuid, ${link.IdeContract}::uuid, ${amount.toString()}::numeric, ${codCurrency},
         'PASARELA', ${this.gateway.codProvider}, 'PENDIENTE', ${session.externalId}, ${link.IdePaymentLink}::uuid,
         'landing-pago', ${now}, 'landing-pago', ${now})`;
    if (link.CodStatus !== 'CONSENTIDO') await this.links.setStatus(link.IdePaymentLink, 'CONSENTIDO', 'landing');
    return { redirectUrl: session.redirectUrl };
  }

  /** Datos que muestra la página de pago SIMULADA (solo con `PAYMENT_PROVIDER=sandbox`). */
  async sandboxInfo(externalId: string) {
    if (this.gateway.codProvider !== 'sandbox') throw new NotFoundException();
    const rows = await this.prisma.$queryRaw<
      Array<{ Amount: string; CodCurrency: string; CodStatus: string; NumContract: string }>
    >`
      SELECT p."Amount"::text AS "Amount", p."CodCurrency", p."CodStatus", c."NumContract"
        FROM ars_platform."TPayment" p JOIN ars_platform."TContract" c ON c."IdeContract" = p."IdeContract"
       WHERE p."CodProvider" = 'sandbox' AND p."DesExternalId" = ${externalId}`;
    if (!rows.length) throw new NotFoundException('Pago no encontrado');
    return { amount: Number(rows[0].Amount), currency: rows[0].CodCurrency, status: rows[0].CodStatus, numContract: rows[0].NumContract };
  }

  // ---------------------------------------------------------------------

  /**
   * Red de seguridad: si hay un pago PENDIENTE de este enlace y la pasarela
   * sabe consultarlo, se le pregunta su estado real (servidor a servidor) y se
   * procesa igual que un webhook (mismo camino idempotente). Cubre el webhook
   * que no llega (desarrollo local sin túnel) o que se retrasa. Un fallo aquí
   * nunca rompe la landing.
   */
  private async reconcilePending(link: PaymentLinkRow): Promise<PaymentLinkRow> {
    if (!this.gateway.retrieveEvent) return link;
    try {
      const pending = await this.prisma.$queryRaw<Array<{ DesExternalId: string }>>`
        SELECT "DesExternalId" FROM ars_platform."TPayment"
         WHERE "IdePaymentLink" = ${link.IdePaymentLink}::uuid
           AND "CodProvider" = ${this.gateway.codProvider} AND "CodStatus" = 'PENDIENTE'
         ORDER BY "TstCreation" DESC`;
      let changed = false;
      for (const row of pending) {
        const event = await this.gateway.retrieveEvent(row.DesExternalId);
        if (event) {
          const result = await this.events.handle(event);
          changed = changed || result.processed;
        }
      }
      return changed ? ((await this.links.getById(link.IdePaymentLink)) ?? link) : link;
    } catch (err) {
      this.logger.warn(`No se pudo reconciliar el enlace ${link.IdePaymentLink}: ${(err as Error).message}`);
      return link;
    }
  }

  private isActive(link: PaymentLinkRow): boolean {
    return (ACTIVE_LINK_STATUSES as readonly string[]).includes(link.CodStatus);
  }

  private async requireActive(token: string): Promise<PaymentLinkRow> {
    const link = await this.links.resolveByToken(token);
    if (!this.isActive(link)) throw new ConflictException(`El enlace de pago no está disponible (${link.CodStatus})`);
    return link;
  }

  private async loadContract(ideContract: string) {
    const contract = await this.prisma.tContract.findUnique({
      where: { IdeContract: ideContract },
      select: {
        NumContract: true,
        IdeProduct: true,
        TstInitial: true,
        TstEnd: true,
        SProduct: { select: { DesProduct: true } },
        SPaymentFraction: { select: { NumFraction: true } },
        TContractPerson: {
          include: {
            SPersonRol: { select: { CodPersonRol: true } },
            TPerson: { select: { DesFirstName: true, DesLastName1: true } },
          },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    const payer =
      contract.TContractPerson.find((p) => p.SPersonRol.CodPersonRol === 'TOMADOR') ?? contract.TContractPerson[0];
    return {
      numContract: contract.NumContract,
      ideProduct: contract.IdeProduct,
      desProduct: contract.SProduct.DesProduct,
      tstInitial: contract.TstInitial,
      tstEnd: contract.TstEnd,
      numFraction: contract.SPaymentFraction.NumFraction,
      desPayer: payer ? [payer.TPerson.DesFirstName, payer.TPerson.DesLastName1].filter(Boolean).join(' ') : '',
    };
  }

  /** Consentimientos que el producto exige para la acción PAGO (activos y vigentes), en orden. */
  private async applicableConsents(ideProduct: string): Promise<ApplicableConsentRow[]> {
    const ideActivo = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.$queryRaw<ApplicableConsentRow[]>`
      SELECT c."IdeConsent", c."DesConsent", c."DesConsentContent", c."IndMandatory", c."NumOrder"
        FROM ars_platform."SProductConsent" pc
        JOIN ars_platform."SConsent" c ON c."IdeConsent" = pc."IdeConsent"
       WHERE pc."IdeProduct" = ${ideProduct}::uuid AND pc."CodAction" = 'PAGO'
         AND c."IdeState" = ${ideActivo}::uuid AND c."TstInitial" <= ${now} AND c."TstEnd" >= ${now}
       ORDER BY c."NumOrder", c."DesConsent"`;
  }

  private async listConsents(link: PaymentLinkRow, ideProduct: string): Promise<LandingConsent[]> {
    const [applicable, acceptedRows] = await Promise.all([
      this.applicableConsents(ideProduct),
      this.prisma.$queryRaw<Array<{ IdeConsent: string }>>`
        SELECT "IdeConsent" FROM ars_platform."TPersonConsent" WHERE "IdePaymentLink" = ${link.IdePaymentLink}::uuid`,
    ]);
    const accepted = new Set(acceptedRows.map((r) => r.IdeConsent));
    return applicable.map((c) => this.toView(c, accepted.has(c.IdeConsent)));
  }

  /** `DesConsentContent` es JSON libre (ver `CreateConsentDto`): se toma `text`/`label` y `url`/`data` si es un enlace. */
  private toView(row: ApplicableConsentRow, accepted: boolean): LandingConsent {
    const content = (row.DesConsentContent ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const rawUrl = str(content['url']) ?? str(content['data']);
    return {
      ideConsent: row.IdeConsent,
      title: row.DesConsent,
      text: str(content['text']) ?? str(content['label']) ?? row.DesConsent,
      url: rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : null,
      mandatory: row.IndMandatory,
      accepted,
    };
  }
}
