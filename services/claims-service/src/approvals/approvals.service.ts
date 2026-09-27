import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { TransitionApprovalDetailDto } from './dto/transition-approval-detail.dto';

const APPROVAL_INCLUDE = {
  SPaymentType: true,
  SState: true,
  TPerson: true,
  TApprovalDetail: {
    include: {
      SState: true,
      TCoverageProvision: { include: { TRiskCoverage: { include: { SCoveragePlan: { include: { SCoverage: true } } } } } },
    },
  },
  TClaimPayment: { include: { SState: true } },
} as const;

interface ThresholdScope {
  ideProduct: string;
  idePlanProduct: string | null;
  ideCoveragePlan: string;
  ideCurrency: string;
  ideClaimFile: string;
}

interface ResolvedLevel {
  level: number;
  ideRol: string;
  codRol: string;
}

/**
 * Flujo de aprobación de siniestros -- Fase 4, Etapa 2, 2026-09-24.
 * Diseñado con el usuario a lo largo de varias rondas de preguntas (ver
 * docs/02-roadmap.md para el resumen). Piezas:
 *
 *  - `TApproval` (cabecera): agrupa el pago de varias coberturas de una
 *    misma `TClaimFile` bajo una sola forma/medio de pago
 *    (`IdePaymentType`/`IdePersonPayment`, ya en el esquema legado).
 *    Máquina propia MUY simple: Pendiente -> Cerrada (se cierra sola
 *    cuando TODAS sus `TApprovalDetail` llegan a un estado final).
 *
 *  - `TApprovalDetail` (decisión POR COBERTURA -- el usuario pidió
 *    evaluar el escalamiento por cobertura individual, no por el total
 *    de la carpeta): Pendiente nivel 1 -> Pendiente nivel 2 -> Pendiente
 *    nivel 3 -> Aprobado/Rechazado. El NIVEL REQUERIDO para una fila
 *    concreta se resuelve dinámicamente contra `SClaimApprovalThreshold`
 *    (reference-data-service, acceso cruzado vía Prisma -- mismo
 *    criterio que `ClaimRequirementsService` leyendo
 *    `SProductRequirement`) usando el `ApprovedAmount` de esa cobertura
 *    -- NO se guarda una columna "nivel requerido", se recalcula en cada
 *    intento de transición (barato, y evita que quede desactualizado si
 *    el catálogo de umbrales cambia entre medio).
 *
 *  - El "rango" de un usuario para decidir en un nivel dado NO es una
 *    tabla hardcodeada en el código: se deriva de la fila de
 *    `SClaimApprovalThreshold` que, PARA ESE MISMO ALCANCE (producto/
 *    plan/cobertura + moneda), tiene `IdeRol` = el rol del usuario
 *    actual. Si su rol no aparece en ningún nivel de ese alcance, su
 *    rango es 0 (no puede actuar). `ADMIN` es una excepción explícita
 *    (rango infinito, para poder probar/operar sin tener que configurar
 *    umbrales para ese rol) -- decisión de esta implementación, no
 *    confirmada con el usuario.
 *
 *  Regla de transición (`transitionDetail`):
 *   - `APROBAR`/`RECHAZAR`: permitido solo si rango(actor) >= nivel
 *     requerido -- puede decidir directo sin pasar manualmente por cada
 *     escalón intermedio (una gerencia no necesita que el ajustador
 *     escale primero).
 *   - `ESCALAR`: permitido solo si el nivel requerido es MAYOR que el
 *     nivel actual (`PENDIENTE_NIVEL_<N>`) Y rango(actor) >= N.
 *
 *  Al cerrar la última `TApprovalDetail` pendiente de una `TApproval`,
 *  esta cierra sola (`CERRAR`) y `TClaimFile` pasa de "En evaluación" a
 *  "Aprobado" (si al menos una cobertura quedó aprobada) o "Rechazado"
 *  (si todas quedaron rechazadas).
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async createForClaimFile(ideClaimFile: string, dto: CreateApprovalDto, actor: string) {
    const claimFile = await this.prisma.tClaimFile.findUnique({
      where: { IdeClaimFile: ideClaimFile },
      include: { SState: true },
    });
    if (!claimFile) throw new NotFoundException(`No existe carpeta de siniestro con id "${ideClaimFile}"`);
    if (claimFile.SState.CodState !== 'EN_EVALUACION') {
      throw new BadRequestException(
        `La carpeta debe estar "En evaluación" para abrir una aprobación (estado actual: "${claimFile.SState.DesState}")`,
      );
    }

    const openApproval = await this.prisma.tApproval.findFirst({
      where: { IdeClaimFile: ideClaimFile, SState: { CodState: 'PENDIENTE' } },
    });
    if (openApproval) {
      throw new BadRequestException('Ya hay una aprobación pendiente para esta carpeta -- ciérrala antes de abrir otra');
    }

    const paymentType = await this.prisma.sPaymentType.findFirst({ where: { CodPaymentType: dto.codPaymentType } });
    if (!paymentType) throw new NotFoundException(`No existe tipo de pago con código "${dto.codPaymentType}"`);

    const person = await this.prisma.tPerson.findUnique({ where: { IdePerson: dto.idePersonPayment } });
    if (!person) throw new NotFoundException(`No existe persona con id "${dto.idePersonPayment}"`);

    const coverageProvisions = await this.prisma.tCoverageProvision.findMany({
      where: {
        IdeCoverageProvision: { in: dto.details.map((d) => d.ideCoverageProvision) },
        TClaimRisk: { IdeClaimFile: ideClaimFile },
      },
    });
    if (coverageProvisions.length !== dto.details.length) {
      throw new BadRequestException('Una o más coberturas indicadas no pertenecen a esta carpeta de siniestro');
    }

    const existingDetails = await this.prisma.tApprovalDetail.findFirst({
      where: { IdeCoverageProvision: { in: dto.details.map((d) => d.ideCoverageProvision) } },
    });
    if (existingDetails) {
      throw new BadRequestException('Una o más coberturas indicadas ya tienen una aprobación registrada');
    }

    const now = new Date();
    const [ideStateApproval, ideStateDetail] = await Promise.all([
      this.stateMachine.getInitialState('TApproval'),
      this.stateMachine.getInitialState('TApprovalDetail'),
    ]);

    const numApproval = await this.generateNumApproval();

    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.tApproval.create({
        data: {
          IdeClaimFile: ideClaimFile,
          NumApproval: numApproval,
          IdePaymentType: paymentType.IdePaymentType,
          IdePersonPayment: person.IdePerson,
          // TstSending/TstPayment son NOT NULL aunque todavía no pasaron
          // -- mismo criterio "convención de pendiente" que
          // TstRequest===TstReception en ClaimRequirementsService (ver
          // su doc-comment): se igualan a TstApproval hasta que el pago
          // real se registre en TClaimPayment.
          TstApproval: now,
          TstSending: now,
          TstPayment: now,
          DesObservation: dto.desObservation,
          IdeState: ideStateApproval,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });

      for (const detail of dto.details) {
        await tx.tApprovalDetail.create({
          data: {
            IdeApproval: approval.IdeApproval,
            IdeCoverageProvision: detail.ideCoverageProvision,
            ApprovedAmount: detail.approvedAmount,
            IdeState: ideStateDetail,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });
      }

      return approval.IdeApproval;
    }).then((ideApproval) => this.findOne(ideApproval));
  }

  async findOne(ideApproval: string) {
    const row = await this.prisma.tApproval.findUnique({ where: { IdeApproval: ideApproval }, include: APPROVAL_INCLUDE });
    if (!row) throw new NotFoundException(`No existe aprobación con id "${ideApproval}"`);
    return row;
  }

  findAllForClaimFile(ideClaimFile: string) {
    return this.prisma.tApproval.findMany({ where: { IdeClaimFile: ideClaimFile }, include: APPROVAL_INCLUDE, orderBy: { TstCreation: 'desc' } });
  }

  async transitionDetail(ideApprovalDetail: string, dto: TransitionApprovalDetailDto, actor: string, actorRole: string) {
    const detail = await this.prisma.tApprovalDetail.findUnique({
      where: { IdeApprovalDetail: ideApprovalDetail },
      include: { SState: true, TApproval: true },
    });
    if (!detail) throw new NotFoundException(`No existe detalle de aprobación con id "${ideApprovalDetail}"`);

    const currentLevel = this.levelOfStateCode(detail.SState.CodState);
    if (currentLevel === null) {
      throw new BadRequestException(`La cobertura ya tiene una decisión final ("${detail.SState.DesState}")`);
    }

    const scope = await this.resolveThresholdScope(detail.IdeCoverageProvision);
    const resolved = await this.resolveRequiredLevel(scope, Number(detail.ApprovedAmount));
    const actorRank = actorRole === 'ADMIN' ? Infinity : this.rankOf(resolved.candidates, actorRole);

    if (actorRank < currentLevel) {
      throw new ForbiddenException(
        `Tu rol no tiene autorización para actuar en este nivel de aprobación (nivel actual: ${currentLevel})`,
      );
    }

    const now = new Date();
    if (dto.codOperative === 'ESCALAR') {
      if (resolved.level <= currentLevel) {
        throw new BadRequestException('Este monto ya se puede decidir en el nivel actual -- no hace falta escalar');
      }
      const nextStateId = await this.stateMachine.getNextState('TApprovalDetail', detail.IdeState, 'ESCALAR');
      await this.prisma.tApprovalDetail.update({
        where: { IdeApprovalDetail: ideApprovalDetail },
        data: { IdeState: nextStateId, UsrModification: actor, TstModification: now },
      });
      return this.prisma.tApprovalDetail.findUnique({ where: { IdeApprovalDetail: ideApprovalDetail }, include: { SState: true } });
    }

    // APROBAR / RECHAZAR
    if (actorRank < resolved.level) {
      throw new ForbiddenException(
        `Este monto requiere aprobación de nivel ${resolved.level} (${resolved.codRol}) o superior`,
      );
    }
    const nextStateId = await this.stateMachine.getNextState('TApprovalDetail', detail.IdeState, dto.codOperative);
    await this.prisma.$transaction(async (tx) => {
      await tx.tApprovalDetail.update({
        where: { IdeApprovalDetail: ideApprovalDetail },
        data: { IdeState: nextStateId, UsrModification: actor, TstModification: now },
      });
      // Sincroniza el `ApprovedAmount` de la cobertura en sí (`TCoverageProvision`,
      // la tabla que ya existía desde Etapa 1 y se muestra en la sección
      // "Coberturas" de la pantalla) con la decisión recién tomada -- sin esto,
      // esa columna se queda para siempre en el 0 con el que nace la cobertura al
      // declarar el siniestro, aunque el detalle de la aprobación (`TApprovalDetail`,
      // Etapa 2) ya tenga el monto real. Una cobertura solo puede tener UN
      // `TApprovalDetail` en toda su vida (ver `UK_TApprovalDetail_01` y la
      // validación en `createForClaimFile`), así que esta sincronización 1:1 es
      // segura. Si se rechaza, se deja en 0 explícitamente (no queda nada aprobado).
      await tx.tCoverageProvision.update({
        where: { IdeCoverageProvision: detail.IdeCoverageProvision },
        data: {
          ApprovedAmount: dto.codOperative === 'APROBAR' ? detail.ApprovedAmount : 0,
          UsrModification: actor,
          TstModification: now,
        },
      });
    });

    await this.maybeCloseApproval(detail.IdeApproval, actor);

    return this.prisma.tApprovalDetail.findUnique({ where: { IdeApprovalDetail: ideApprovalDetail }, include: { SState: true } });
  }

  /** Códigos de estado de `TApprovalDetail` -> nivel de escalamiento actual (null = ya es un estado final). */
  private levelOfStateCode(codState: string): number | null {
    switch (codState) {
      case 'PENDIENTE_NIVEL_1':
        return 1;
      case 'PENDIENTE_NIVEL_2':
        return 2;
      case 'PENDIENTE_NIVEL_3':
        return 3;
      default:
        return null;
    }
  }

  private async resolveThresholdScope(ideCoverageProvision: string): Promise<ThresholdScope> {
    const cp = await this.prisma.tCoverageProvision.findUnique({
      where: { IdeCoverageProvision: ideCoverageProvision },
      include: {
        TRiskCoverage: { select: { IdeCoveragePlan: true } },
        TClaimRisk: {
          include: {
            TClaimFile: { select: { IdeClaimFile: true, IdeCurrency: true } },
            TFileRisk: {
              include: {
                SPlanProductRisk: { select: { IdePlanProduct: true } },
                TContractFile: { include: { TContract: { select: { IdeProduct: true } } } },
              },
            },
          },
        },
      },
    });
    if (!cp) throw new NotFoundException(`No existe provisión de cobertura con id "${ideCoverageProvision}"`);

    return {
      ideProduct: cp.TClaimRisk.TFileRisk.TContractFile.TContract.IdeProduct,
      idePlanProduct: cp.TClaimRisk.TFileRisk.SPlanProductRisk.IdePlanProduct,
      ideCoveragePlan: cp.TRiskCoverage.IdeCoveragePlan,
      ideCurrency: cp.TClaimRisk.TClaimFile.IdeCurrency,
      ideClaimFile: cp.TClaimRisk.TClaimFile.IdeClaimFile,
    };
  }

  private async resolveRequiredLevel(
    scope: ThresholdScope,
    amount: number,
  ): Promise<ResolvedLevel & { candidates: Array<{ Level: number; IdeRol: string; CodRol: string }> }> {
    const rows = await this.prisma.sClaimApprovalThreshold.findMany({
      where: {
        IdeCurrency: scope.ideCurrency,
        IdeProduct: scope.ideProduct,
        OR: [
          { IdePlanProduct: null, IdeCoveragePlan: null },
          { IdePlanProduct: scope.idePlanProduct, IdeCoveragePlan: null },
          { IdePlanProduct: null, IdeCoveragePlan: scope.ideCoveragePlan },
          { IdePlanProduct: scope.idePlanProduct, IdeCoveragePlan: scope.ideCoveragePlan },
        ],
      },
      include: { TRol: true },
    });
    if (rows.length === 0) {
      throw new NotFoundException(
        'No hay umbrales de aprobación configurados para el producto/moneda de esta cobertura (ver catálogo "Umbrales de aprobación")',
      );
    }

    const scoreOf = (r: (typeof rows)[number]) => (r.IdeCoveragePlan ? 2 : r.IdePlanProduct ? 1 : 0);
    const bestScore = Math.max(...rows.map(scoreOf));
    const scoped = rows.filter((r) => scoreOf(r) === bestScore).sort((a, b) => a.Level - b.Level);

    const candidates = scoped.map((r) => ({ Level: r.Level, IdeRol: r.IdeRol, CodRol: r.TRol.CodRol }));

    for (const row of scoped) {
      if (row.MaxAmount === null || Number(row.MaxAmount) >= amount) {
        return { level: row.Level, ideRol: row.IdeRol, codRol: row.TRol.CodRol, candidates };
      }
    }
    const last = scoped[scoped.length - 1];
    return { level: last.Level, ideRol: last.IdeRol, codRol: last.TRol.CodRol, candidates };
  }

  private rankOf(candidates: Array<{ Level: number; CodRol: string }>, codRol: string): number {
    const match = candidates.find((c) => c.CodRol === codRol);
    return match ? match.Level : 0;
  }

  private async maybeCloseApproval(ideApproval: string, actor: string) {
    const approval = await this.prisma.tApproval.findUnique({
      where: { IdeApproval: ideApproval },
      include: { TApprovalDetail: { include: { SState: true } }, SState: true },
    });
    if (!approval || approval.SState.CodState !== 'PENDIENTE') return;

    const stillPending = approval.TApprovalDetail.some((d) => this.levelOfStateCode(d.SState.CodState) !== null);
    if (stillPending) return;

    const now = new Date();
    const closedStateId = await this.stateMachine.getNextState('TApproval', approval.IdeState, 'CERRAR');
    await this.prisma.tApproval.update({
      where: { IdeApproval: ideApproval },
      data: { IdeState: closedStateId, UsrModification: actor, TstModification: now },
    });

    const anyApproved = approval.TApprovalDetail.some((d) => d.SState.CodState === 'APROBADO');
    const claimFile = await this.prisma.tClaimFile.findUnique({ where: { IdeClaimFile: approval.IdeClaimFile }, include: { SState: true } });
    if (!claimFile || claimFile.SState.CodState !== 'EN_EVALUACION') return; // ya se movió por otra vía, no forzar

    const op = anyApproved ? 'APROBAR' : 'RECHAZAR';
    const nextClaimFileState = await this.stateMachine.getNextState('TClaimFile', claimFile.IdeState, op);
    await this.prisma.tClaimFile.update({
      where: { IdeClaimFile: claimFile.IdeClaimFile },
      data: { IdeState: nextClaimFileState, UsrModification: actor, TstModification: now },
    });
  }

  /** Mismo criterio que `ClaimsService.generateNumClaim` -- secuencia real de Postgres. */
  private async generateNumApproval(): Promise<string> {
    const result = await this.prisma.$queryRaw<{ nextval: number }[]>`
      SELECT nextval('ars_platform."SeqTApprovalNumber"')::int AS nextval
    `;
    const year = new Date().getFullYear();
    return `APR-${year}-${result[0].nextval}`;
  }
}
