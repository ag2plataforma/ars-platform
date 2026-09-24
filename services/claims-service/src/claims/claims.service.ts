import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { ClaimRequirementsService } from '../requirements/claim-requirements.service';
import { DeclareClaimDto } from './dto/declare-claim.dto';

const CLAIM_INCLUDE = {
  SClaimType: true,
  SState: true,
  TContractFile: { include: { TContract: { include: { SProduct: true } } } },
  TClaimFile: {
    include: {
      SClaimEvent: true,
      SCurrency: true,
      SState: true,
      TClaimRisk: {
        include: {
          SState: true,
          TFileRisk: { include: { SRiskProduct: true, SPlanProductRisk: { include: { SPlanProduct: true } } } },
          TCoverageProvision: {
            include: { TRiskCoverage: { include: { SCoveragePlan: { include: { SCoverage: true } } } }, SState: true },
          },
          TClaimRequirement: {
            include: { SProductRequirement: { include: { SRequirement: true } }, SState: true },
          },
        },
      },
    },
  },
} as const;

/**
 * Cascada de declaración de siniestro (`TClaim` -> `TClaimFile` ->
 * `TClaimRisk` -> `TCoverageProvision`), Fase 4 (Siniestros), Etapa 1 --
 * diseñada desde cero (investigación confirmó CERO PL/pgSQL y CERO datos
 * reales para todo el dominio, ver
 * `packages/database/scripts/investigate-claims-engine.js`), mismo
 * criterio que se usó originalmente para `TQuote`/`TQuoteRisk` (tampoco
 * tenían función legada que replicar).
 *
 * Alcance acordado con el usuario 2026-09-24 ("si inicia con la etapa 1",
 * ver docs/02-roadmap.md): declarar el siniestro + sus riesgos afectados,
 * crear una provisión inicial por cada cobertura afectada, y resolver el
 * checklist de documentos exigidos (`ClaimRequirementsService`, motor
 * propio de `claims-service`, ver su doc-comment) -- SIN aprobación, sin
 * pago, sin cálculo real de deducible/uso de garantías (`TApproval`/
 * `TApprovalDetail`/`TGuaranteeProvision`, Etapa 2, deferida hasta tener
 * reglas de negocio reales del usuario).
 *
 * Un solo `TClaimFile` por siniestro en esta primera vuelta (la tabla
 * real admite varios, pero declarar-un-siniestro no necesita más de uno
 * para el alcance de Etapa 1) -- `NumClaim`/`NumClaimFile` se generan con
 * secuencias reales de Postgres, mismo criterio explícito que
 * `NumQuote`/`NumContract` (ver `generateNumContract` en
 * `underwriting-service`): evita el riesgo de colisión bajo concurrencia
 * de un `MAX+1` en memoria. Requiere haber corrido
 * `packages/database/scripts/setup-claim-number-sequences.js` (toca la
 * BD real, lo corre el usuario).
 *
 * `TClaim`/`TClaimFile`/`TClaimRisk`/`TCoverageProvision` nacen en el
 * mismo estado "sin transición" (`SEED_BORRADOR`) que usan
 * `TContractRequirement`/`TQuoteRequirement` -- agregadas a
 * `NO_TRANSITION_ENTITIES` en `seed-contract-testing-fixtures.js` (correr
 * de nuevo ese script, es idempotente). No hay máquina de estados real
 * todavía para el ciclo de vida del siniestro (abierto/cerrado/rechazado)
 * -- Etapa 2 la diseñará junto con el flujo de aprobación.
 */
@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly claimRequirements: ClaimRequirementsService,
  ) {}

  async declare(dto: DeclareClaimDto, actor: string) {
    const claimType = await this.prisma.sClaimType.findFirst({ where: { CodClaimType: dto.codClaimType } });
    if (!claimType) throw new NotFoundException(`No existe tipo de siniestro con código "${dto.codClaimType}"`);

    const contractFile = await this.prisma.tContractFile.findUnique({
      where: { IdeContractFile: dto.ideContractFile },
      include: { TContract: true },
    });
    if (!contractFile) throw new NotFoundException(`No existe expediente de contrato con id "${dto.ideContractFile}"`);
    if (contractFile.TContract.IdeProduct !== claimType.IdeProduct) {
      throw new BadRequestException(
        `El tipo de siniestro "${dto.codClaimType}" no aplica al producto de este contrato`,
      );
    }

    const claimEvent = await this.prisma.sClaimEvent.findFirst({ where: { CodClaimEvent: dto.codClaimEvent } });
    if (!claimEvent) throw new NotFoundException(`No existe evento de siniestro con código "${dto.codClaimEvent}"`);
    if (claimEvent.IdeClaimType !== claimType.IdeClaimType) {
      throw new BadRequestException(`El evento "${dto.codClaimEvent}" no pertenece al tipo de siniestro indicado`);
    }

    const currency = await this.prisma.sCurrency.findFirst({ where: { CodCurrency: dto.codCurrency } });
    if (!currency) throw new NotFoundException(`No existe moneda con código "${dto.codCurrency}"`);

    const fileRisks = await this.prisma.tFileRisk.findMany({
      where: { IdeFileRisk: { in: dto.ideFileRisks }, IdeContractFile: dto.ideContractFile },
    });
    if (fileRisks.length !== dto.ideFileRisks.length) {
      throw new BadRequestException('Uno o más riesgos indicados no pertenecen al expediente de contrato indicado');
    }

    const now = new Date();
    const ideClaim = await this.prisma.$transaction(async (tx) => {
      const [ideStateClaim, ideStateClaimFile, ideStateClaimRisk, ideStateCoverageProvision] = await Promise.all([
        this.stateMachine.getInitialState('TClaim'),
        this.stateMachine.getInitialState('TClaimFile'),
        this.stateMachine.getInitialState('TClaimRisk'),
        this.stateMachine.getInitialState('TCoverageProvision'),
      ]);

      const numClaim = await this.generateNumClaim(tx);
      const claim = await tx.tClaim.create({
        data: {
          IdeClaimType: claimType.IdeClaimType,
          IdeContractFile: dto.ideContractFile,
          NumClaim: numClaim,
          TstOcurrence: new Date(dto.tstOcurrence),
          TstNotification: new Date(dto.tstNotification),
          TstConstitution: new Date(dto.tstConstitution),
          IdeState: ideStateClaim,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });

      const numClaimFile = await this.generateNumClaimFile(tx);
      const claimFile = await tx.tClaimFile.create({
        data: {
          IdeClaim: claim.IdeClaim,
          IdeClaimEvent: claimEvent.IdeClaimEvent,
          IdeCurrency: currency.IdeCurrency,
          NumClaimFile: numClaimFile,
          DesLarge: dto.desLarge,
          IdeState: ideStateClaimFile,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });

      for (const fileRisk of fileRisks) {
        const claimRisk = await tx.tClaimRisk.create({
          data: {
            IdeClaimFile: claimFile.IdeClaimFile,
            IdeFileRisk: fileRisk.IdeFileRisk,
            IdeState: ideStateClaimRisk,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });

        const riskCoverages = await tx.tRiskCoverage.findMany({
          where: { IdeFileRisk: fileRisk.IdeFileRisk, SState: { CodState: 'ACTIVO' } },
        });
        for (const riskCoverage of riskCoverages) {
          await tx.tCoverageProvision.create({
            data: {
              IdeClaimRisk: claimRisk.IdeClaimRisk,
              IdeRiskCoverage: riskCoverage.IdeRiskCoverage,
              // `CoveredAmount` = provisión inicial sugerida del tipo de
              // siniestro (`SClaimType.InitialProvisionAmount`) -- las
              // demás quedan en 0 hasta la revisión/aprobación real
              // (Etapa 2). Decisión de esta implementación, no
              // confirmada con el usuario -- ver el doc-comment de la
              // clase.
              InvoicedAmount: 0,
              CoveredAmount: claimType.InitialProvisionAmount,
              ApprovedAmount: 0,
              IndemnifiedAmount: 0,
              NoCoveredAmount: 0,
              IdeState: ideStateCoverageProvision,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            },
          });
        }

        const idePlanProduct = await this.resolvePlanProductOf(fileRisk.IdePlanProductRisk, tx);
        await this.claimRequirements.resolveForClaimRisk(
          {
            ideClaimFile: claimFile.IdeClaimFile,
            ideClaimRisk: claimRisk.IdeClaimRisk,
            ideClaimType: claimType.IdeClaimType,
            ideClaimEvent: claimEvent.IdeClaimEvent,
            ideProduct: contractFile.TContract.IdeProduct,
            ideRiskProduct: fileRisk.IdeRiskProduct,
            idePlanProduct,
            actor,
          },
          tx,
        );
      }

      return claim.IdeClaim;
    });

    return this.findOne(ideClaim);
  }

  async findOne(ideClaim: string) {
    const claim = await this.prisma.tClaim.findUnique({ where: { IdeClaim: ideClaim }, include: CLAIM_INCLUDE });
    if (!claim) throw new NotFoundException(`No existe siniestro con id "${ideClaim}"`);
    return claim;
  }

  /** Listado simple (sin paginación -- alcance de Etapa 1, ver docs/02-roadmap.md), filtrable por número de siniestro/estado. */
  async findAll(filterNumClaim?: string, codState?: string) {
    const where: Prisma.TClaimWhereInput = {};
    if (filterNumClaim) where.NumClaim = { contains: filterNumClaim, mode: 'insensitive' };
    if (codState) where.SState = { CodState: codState };
    return this.prisma.tClaim.findMany({
      where,
      include: { SClaimType: true, SState: true, TContractFile: { include: { TContract: true } } },
      orderBy: { TstCreation: 'desc' },
    });
  }

  private async resolvePlanProductOf(idePlanProductRisk: string, tx: Prisma.TransactionClient): Promise<string | null> {
    const row = await tx.sPlanProductRisk.findUnique({ where: { IdePlanProductRisk: idePlanProductRisk } });
    return row?.IdePlanProduct ?? null;
  }

  /**
   * Genera `NumClaim` con una secuencia real de Postgres, mismo criterio
   * explícito que `ContractsService.generateNumContract`/
   * `QuotesService.generateNumQuote` -- ver
   * `packages/database/scripts/setup-claim-number-sequences.js`.
   */
  private async generateNumClaim(tx: Prisma.TransactionClient): Promise<string> {
    const result = await tx.$queryRaw<{ nextval: number }[]>`
      SELECT nextval('ars_platform."SeqTClaimNumber"')::int AS nextval
    `;
    const year = new Date().getFullYear();
    return `SIN-${year}-${result[0].nextval}`;
  }

  private async generateNumClaimFile(tx: Prisma.TransactionClient): Promise<string> {
    const result = await tx.$queryRaw<{ nextval: number }[]>`
      SELECT nextval('ars_platform."SeqTClaimFileNumber"')::int AS nextval
    `;
    const year = new Date().getFullYear();
    return `SINEXP-${year}-${result[0].nextval}`;
  }
}
