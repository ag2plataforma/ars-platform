import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateClaimPaymentDto } from './dto/create-claim-payment.dto';

/**
 * Registro de la EJECUCIÓN del pago de una aprobación de siniestro
 * (`TClaimPayment`) -- Fase 4, Etapa 2, 2026-09-24. `TApproval` ya
 * guarda la INTENCIÓN de pago (`IdePaymentType`/`IdePersonPayment`,
 * fijados al crear la aprobación); esta tabla registra que el pago
 * REALMENTE se hizo. Deliberadamente NO se integra con billing-service
 * (`TReceipt`/`TCoverageMovement` están diseñados para COBRAR primas,
 * no para pagar indemnizaciones -- ver discusión con el usuario,
 * 2026-09-24) -- queda para una Etapa 3.
 *
 * Al registrar el pago, `TClaimFile` pasa de "Aprobado" a "Pagado".
 */
@Injectable()
export class ClaimPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAllForApproval(ideApproval: string) {
    return this.prisma.tClaimPayment.findMany({ where: { IdeApproval: ideApproval }, include: { SState: true }, orderBy: { TstCreation: 'desc' } });
  }

  async createForApproval(ideApproval: string, dto: CreateClaimPaymentDto, actor: string) {
    const approval = await this.prisma.tApproval.findUnique({
      where: { IdeApproval: ideApproval },
      include: { SState: true },
    });
    if (!approval) throw new NotFoundException(`No existe aprobación con id "${ideApproval}"`);
    if (approval.SState.CodState !== 'CERRADA') {
      throw new BadRequestException(`La aprobación debe estar "Cerrada" para registrar su pago (estado actual: "${approval.SState.DesState}")`);
    }

    const claimFile = await this.prisma.tClaimFile.findUnique({ where: { IdeClaimFile: approval.IdeClaimFile }, include: { SState: true } });
    if (!claimFile) throw new NotFoundException(`No existe carpeta de siniestro con id "${approval.IdeClaimFile}"`);
    if (claimFile.SState.CodState !== 'APROBADO') {
      throw new BadRequestException(`La carpeta debe estar "Aprobado" para registrar el pago (estado actual: "${claimFile.SState.DesState}")`);
    }

    const activeStateId = await this.stateMachine.getInitialState('TClaimPayment');
    const now = new Date();
    const numPayment = await this.generateNumPayment();

    // Coberturas aprobadas de esta aprobación -- al confirmarse el pago, se
    // sincroniza `TCoverageProvision.IndemnifiedAmount` de cada una con el
    // monto que se les aprobó (mismo criterio que `ApprovedAmount` en
    // `ApprovalsService.transitionDetail`: sin esto, "Indemnizado" en la
    // sección "Coberturas" se queda en 0 para siempre aunque el pago ya se
    // haya registrado).
    const approvedDetails = await this.prisma.tApprovalDetail.findMany({
      where: { IdeApproval: ideApproval, SState: { CodState: 'APROBADO' } },
    });

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tClaimPayment.create({
        data: {
          IdeApproval: ideApproval,
          NumPayment: numPayment,
          Amount: dto.amount,
          TstPayment: new Date(dto.tstPayment),
          NumExternalPayment: dto.numExternalPayment,
          DesObservation: dto.desObservation,
          IdeState: activeStateId,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });

      const paidStateId = await this.stateMachine.getNextState('TClaimFile', claimFile.IdeState, 'PAGAR');
      await tx.tClaimFile.update({
        where: { IdeClaimFile: claimFile.IdeClaimFile },
        data: { IdeState: paidStateId, UsrModification: actor, TstModification: now },
      });

      for (const detail of approvedDetails) {
        await tx.tCoverageProvision.update({
          where: { IdeCoverageProvision: detail.IdeCoverageProvision },
          data: { IndemnifiedAmount: detail.ApprovedAmount, UsrModification: actor, TstModification: now },
        });
      }

      return created;
    });

    return this.prisma.tClaimPayment.findUnique({ where: { IdeClaimPayment: payment.IdeClaimPayment }, include: { SState: true } });
  }

  private async generateNumPayment(): Promise<string> {
    const result = await this.prisma.$queryRaw<{ nextval: number }[]>`
      SELECT nextval('ars_platform."SeqTClaimPaymentNumber"')::int AS nextval
    `;
    const year = new Date().getFullYear();
    return `PAGSIN-${year}-${result[0].nextval}`;
  }
}
