import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';

export type PaymentMethod = 'PASARELA' | 'MANUAL';

export interface RegisterPaymentInput {
  codMethod: PaymentMethod;
  /** Solo PASARELA: stripe, sandbox... */
  codProvider?: string | null;
  /** Solo PASARELA: id de la sesión/pago en la pasarela. */
  externalId?: string | null;
  /** Solo MANUAL: motivo escrito por el operador. */
  reason?: string | null;
  /** Datos crudos/normalizados de la pasarela. */
  payload?: Record<string, unknown> | null;
  actor: string;
}

export interface PaymentRow {
  IdePayment: string;
  IdeReceipt: string;
  NumReceipt: string;
  Amount: string;
  CodCurrency: string;
  CodMethod: PaymentMethod;
  CodProvider: string | null;
  CodStatus: string;
  DesExternalId: string | null;
  DesReason: string | null;
  TstPaid: Date | null;
  UsrCreation: string;
  TstCreation: Date;
}

/**
 * Cobro de recibos (roadmap, "Cobranza y activación con pago").
 *
 * Capa baja y SIN dependencias de `ContractsService`: marca recibos como
 * cobrados (`TReceipt`, transición `'Cobrar'`) y deja el registro en
 * `TPayment`. La usan la activación manual del contrato (etapa 1) y, más
 * adelante, el webhook de la pasarela (etapa 3) -- siempre dentro de la
 * transacción que ya activa el contrato, para que "cobrado" y "activo" no
 * puedan quedar desalineados.
 *
 * `TPayment` se accede con SQL crudo (la tabla la crea
 * `packages/database/scripts/setup-payments.js`; así este archivo compila
 * aunque todavía no se haya regenerado el cliente Prisma).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  /**
   * Recibos de la PRIMERA cuota del contrato: el `NEW`/`REN` no anulado con
   * la fecha de inicio más temprana (si hay un recibo por archivo de póliza,
   * todos los de esa misma operación) y la moneda del producto.
   */
  async findFirstReceiptGroup(ideContract: string, tx: Prisma.TransactionClient = this.prisma) {
    const receipts = await tx.tReceipt.findMany({
      where: {
        IdeContract: ideContract,
        TstCancellation: null,
        SReceiptType: { CodReceiptType: { in: ['NEW', 'REN'] } },
      },
      orderBy: [{ TstInitial: 'asc' }, { NumReceipt: 'asc' }],
    });
    if (receipts.length === 0) {
      throw new ConflictException(`El contrato "${ideContract}" no tiene un recibo inicial para cobrar`);
    }
    const contract = await tx.tContract.findUniqueOrThrow({
      where: { IdeContract: ideContract },
      select: { SProduct: { select: { SCurrency: { select: { CodCurrency: true, SymbolCurrency: true } } } } },
    });
    return {
      receipts: receipts.filter((r) => r.IdeContractOperation === receipts[0].IdeContractOperation),
      codCurrency: contract.SProduct.SCurrency.CodCurrency,
      symbolCurrency: contract.SProduct.SCurrency.SymbolCurrency,
    };
  }

  /**
   * Marca como COBRADO el recibo de la PRIMERA cuota del contrato (el de
   * `NEW`/`REN` no anulado con la fecha de inicio más temprana; si el
   * contrato tiene un recibo por archivo de póliza, todos los de esa misma
   * operación) y registra el cobro. Devuelve los recibos cobrados.
   */
  async registerFirstReceiptPayment(
    ideContract: string,
    input: RegisterPaymentInput,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Array<{ ideReceipt: string; numReceipt: string; amount: number }>> {
    const { receipts: first, codCurrency } = await this.findFirstReceiptGroup(ideContract, tx);
    const ideCobrado = await this.stateMachine.getStateByCode('COBRADO');
    const now = new Date();

    const paid: Array<{ ideReceipt: string; numReceipt: string; amount: number }> = [];
    for (const receipt of first) {
      if (receipt.IdeState === ideCobrado) {
        throw new ConflictException(`El recibo "${receipt.NumReceipt}" ya está cobrado`);
      }
      const nextState = await this.stateMachine.getNextState('TReceipt', receipt.IdeState, 'Cobrar');
      await tx.tReceipt.update({
        where: { IdeReceipt: receipt.IdeReceipt },
        data: { IdeState: nextState, UsrModification: input.actor, TstModification: now },
      });
      // Si el cobro nació como intento PENDIENTE (checkout de la pasarela), se
      // confirma ESA fila; si no (activación manual), se registra una nueva.
      const confirmed =
        input.codProvider && input.externalId
          ? await tx.$executeRaw`
              UPDATE ars_platform."TPayment"
                 SET "CodStatus" = 'COBRADO', "TstPaid" = ${now}, "DesPayload" = ${input.payload ? JSON.stringify(input.payload) : null}::jsonb,
                     "UsrModification" = ${input.actor}, "TstModification" = ${now}
               WHERE "IdeReceipt" = ${receipt.IdeReceipt}::uuid AND "CodProvider" = ${input.codProvider}
                 AND "DesExternalId" = ${input.externalId} AND "CodStatus" = 'PENDIENTE'`
          : 0;
      if (confirmed === 0) {
        await tx.$executeRaw`
          INSERT INTO ars_platform."TPayment"
            ("IdeReceipt", "IdeContract", "Amount", "CodCurrency", "CodMethod", "CodProvider", "CodStatus",
             "DesExternalId", "DesReason", "DesPayload", "TstPaid",
             "UsrCreation", "TstCreation", "UsrModification", "TstModification")
          VALUES
            (${receipt.IdeReceipt}::uuid, ${ideContract}::uuid, ${receipt.Prime.toString()}::numeric, ${codCurrency},
             ${input.codMethod}, ${input.codProvider ?? null}, 'COBRADO',
             ${input.externalId ?? null}, ${input.reason ?? null},
             ${input.payload ? JSON.stringify(input.payload) : null}::jsonb, ${now},
             ${input.actor}, ${now}, ${input.actor}, ${now})
        `;
      }
      paid.push({ ideReceipt: receipt.IdeReceipt, numReceipt: receipt.NumReceipt, amount: Number(receipt.Prime) });
    }
    return paid;
  }

  /** Cobros registrados de un contrato (más recientes primero). */
  async listByContract(ideContract: string, tx: Prisma.TransactionClient = this.prisma): Promise<PaymentRow[]> {
    return tx.$queryRaw<PaymentRow[]>`
      SELECT p."IdePayment", p."IdeReceipt", r."NumReceipt", p."Amount"::text AS "Amount", p."CodCurrency",
             p."CodMethod", p."CodProvider", p."CodStatus", p."DesExternalId", p."DesReason", p."TstPaid",
             p."UsrCreation", p."TstCreation"
        FROM ars_platform."TPayment" p
        JOIN ars_platform."TReceipt" r ON r."IdeReceipt" = p."IdeReceipt"
       WHERE p."IdeContract" = ${ideContract}::uuid
       ORDER BY p."TstCreation" DESC
    `;
  }
}
