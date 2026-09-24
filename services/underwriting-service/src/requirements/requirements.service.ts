import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SProductRequirement } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { PROCESS_CODE_CONTRACT, PROCESS_CODE_QUOTE } from './requirements.constants';

const REQUIREMENT_INCLUDE = {
  SProductRequirement: { include: { SRequirement: true } },
  SState: true,
} as const;

export interface DeliveredFlag {
  indDelivered: boolean;
  usrDelivered: string;
  tstDelivered: string;
}

/**
 * Feature "Requisitos" (checklist de documentos exigidos), Etapa 1 --
 * investigada y acordada con el usuario 2026-09-24 (ver
 * docs/02-roadmap.md y el doc-comment de `ProductRequirementService` en
 * `reference-data-service`, que tiene la CONFIGURACIÓN; acá vive la
 * RESOLUCIÓN contra una cotización/contrato reales).
 *
 * Alcance acordado con el usuario:
 *  - Etapa 1 = checklist SIN archivo real: no existe mecanismo de
 *    subida de archivos en todo el monorepo (confirmado por búsqueda).
 *    "Entregado" se guarda como flag en la columna `Data` (JSON) de
 *    `TQuoteRequirement`/`TContractRequirement`, NO como una transición
 *    de estado real -- mismo criterio que `TContractOperation.Data`, y
 *    evita tener que inventar una regla de máquina de estados
 *    ("Entregado") que no existe en el motor real. `IdeState` de ambas
 *    tablas se queda siempre en su estado inicial (agregadas a
 *    `NO_TRANSITION_ENTITIES` en `seed-contract-testing-fixtures.js`,
 *    ver ese archivo).
 *  - Solo Cotización + Contratación por ahora (Siniestros queda afuera
 *    hasta que arranque la Fase 4) -- de ahí `PROCESS_CODE_QUOTE`/
 *    `PROCESS_CODE_CONTRACT`.
 *  - Resolución en DOS momentos, no uno (decisión explícita del usuario,
 *    2026-09-24): al cotizar, se resuelven las filas de
 *    `SProductRequirement` marcadas con proceso Cotización
 *    (`resolveForQuote`, idempotente -- se puede llamar repetidas veces
 *    a medida que el wizard avanza sin duplicar filas). Al crear el
 *    contrato, ADEMÁS de heredar lo ya resuelto en la cotización (la
 *    copia `TQuoteRequirement` -> `TContractRequirement` YA existe en
 *    `ContractsService.copyRisksAndCoverages`, sin tocar), se resuelven
 *    también las filas marcadas con proceso Contratación
 *    (`resolveContractRequirementsForRisk`/`ForCoverage`, sin necesidad
 *    de deduplicar -- se llaman una sola vez por contrato nuevo, sobre
 *    filas de `SProductRequirement` DISTINTAS de las de cotización,
 *    porque `@@unique([IdeProcess, IdeProduct, IdeRequirement])` nunca
 *    deja que la misma fila tenga dos procesos a la vez).
 *
 * Algoritmo de resolución -- NULL-comodín, se COMBINAN todas las filas
 * aplicables (no se elige "una ganadora" como `ProcessFlowResolver`),
 * porque la restricción única ya garantiza que, para un
 * proceso+producto+requisito, exista una única fila con un único perfil
 * de alcance: no hay ambigüedad que desempatar. Un candidato aplica a un
 * riesgo si `IdeRiskProduct` es NULL o coincide; si además tiene
 * `IdeCoveragePlan` (coincidencia exacta, no comodín -- ver por qué en
 * el doc-comment de `ProductRequirementService`), solo aplica a la
 * cobertura seleccionada con ese `IdeCoveragePlan`; si tiene
 * `IdePlanProduct` (comodín) pero no `IdeCoveragePlan`, aplica a nivel
 * de riesgo pero solo si el plan seleccionado coincide; si no tiene
 * ninguno de los dos, aplica a nivel de riesgo sin importar el plan.
 */
@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  /**
   * Resuelve y crea (idempotente) los `TQuoteRequirement` de una
   * cotización para las filas de `SProductRequirement` marcadas con
   * proceso Cotización. Pensado para llamarse en cada `GET
   * .../requirements` (lazy) -- barato cuando no hay nada nuevo que
   * crear (todo el trabajo real es de lectura si ya se resolvió antes).
   */
  async resolveForQuote(ideQuote: string, actor: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    const quote = await tx.tQuote.findUniqueOrThrow({ where: { IdeQuote: ideQuote } });
    const ideProcess = await this.resolveProcessId(PROCESS_CODE_QUOTE, tx);
    const candidates = await this.findActiveCandidates(ideProcess, quote.IdeProduct, tx);
    if (candidates.length === 0) return;

    const quoteRisks = await tx.tQuoteRisk.findMany({
      where: { IdeQuote: ideQuote },
      include: {
        TQuoteRiskPlan: { where: { IndSelected: true }, include: { TQuoteCoverage: { where: { IndSelected: true } } } },
        TQuoteRequirement: true,
      },
    });

    const ideStateInitial = await this.stateMachine.getInitialState('TQuoteRequirement');
    const now = new Date();

    for (const risk of quoteRisks) {
      const applicable = candidates.filter((c) => !c.IdeRiskProduct || c.IdeRiskProduct === risk.IdeRiskProduct);
      if (applicable.length === 0) continue;

      const selectedPlan = risk.TQuoteRiskPlan[0];
      const idePlanProduct = selectedPlan ? await this.resolvePlanProductOf(selectedPlan.IdePlanProductRisk, tx) : null;
      const already = new Set(risk.TQuoteRequirement.map((r) => r.IdeProductRequirement));

      for (const candidate of applicable) {
        if (already.has(candidate.IdeProductRequirement)) continue;

        if (candidate.IdeCoveragePlan) {
          const coverage = selectedPlan?.TQuoteCoverage.find((c) => c.IdeCoveragePlan === candidate.IdeCoveragePlan);
          if (!coverage) continue;
          if (candidate.IdePlanProduct && candidate.IdePlanProduct !== idePlanProduct) continue;
          await tx.tQuoteRequirement.create({
            data: {
              IdeQuoteRisk: risk.IdeQuoteRisk,
              IdeQuoteRiskPlan: selectedPlan!.IdeQuoteRiskPlan,
              IdeQuoteCoverage: coverage.IdeQuoteCoverage,
              IdeProductRequirement: candidate.IdeProductRequirement,
              IdeState: ideStateInitial,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            },
          });
          continue;
        }

        if (candidate.IdePlanProduct) {
          if (!selectedPlan || candidate.IdePlanProduct !== idePlanProduct) continue;
          await tx.tQuoteRequirement.create({
            data: {
              IdeQuoteRisk: risk.IdeQuoteRisk,
              IdeQuoteRiskPlan: selectedPlan.IdeQuoteRiskPlan,
              IdeProductRequirement: candidate.IdeProductRequirement,
              IdeState: ideStateInitial,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            },
          });
          continue;
        }

        await tx.tQuoteRequirement.create({
          data: {
            IdeQuoteRisk: risk.IdeQuoteRisk,
            IdeProductRequirement: candidate.IdeProductRequirement,
            IdeState: ideStateInitial,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });
      }
    }
  }

  /**
   * Lista los `TQuoteRequirement` de una cotización, resolviendo primero
   * (`resolveForQuote`) para que el checklist siempre esté al día. Usado
   * por el nuevo paso "Requisitos" del wizard de Cotización.
   */
  async listForQuote(ideQuote: string, actor: string) {
    await this.resolveForQuote(ideQuote, actor);
    return this.prisma.tQuoteRequirement.findMany({
      where: { TQuoteRisk: { IdeQuote: ideQuote } },
      include: REQUIREMENT_INCLUDE,
    });
  }

  /** Marca (o desmarca) un `TQuoteRequirement` como entregado -- ver el doc-comment de la clase sobre por qué va en `Data`, no en `IdeState`. */
  async setQuoteRequirementDelivered(ideQuoteRequirement: string, delivered: boolean, actor: string) {
    const row = await this.prisma.tQuoteRequirement.findUnique({ where: { IdeQuoteRequirement: ideQuoteRequirement } });
    if (!row) throw new NotFoundException(`No existe requisito de cotización con id "${ideQuoteRequirement}"`);
    const data: DeliveredFlag = { indDelivered: delivered, usrDelivered: actor, tstDelivered: new Date().toISOString() };
    return this.prisma.tQuoteRequirement.update({
      where: { IdeQuoteRequirement: ideQuoteRequirement },
      data: { Data: data as unknown as Prisma.InputJsonValue, UsrModification: actor, TstModification: new Date() },
      include: REQUIREMENT_INCLUDE,
    });
  }

  /**
   * Resuelve y crea (SIN necesidad de deduplicar, ver doc-comment de la
   * clase) los `TContractRequirement` a nivel de RIESGO (sin cobertura)
   * para las filas de `SProductRequirement` marcadas con proceso
   * Contratación. Llamado desde `ContractsService.copyRisksAndCoverages`
   * justo después de crear cada `TFileRisk`.
   */
  async resolveContractRequirementsForRisk(
    params: { ideFileRisk: string; ideRiskProduct: string; idePlanProduct: string | null; ideProduct: string; actor: string },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ideProcess = await this.resolveProcessId(PROCESS_CODE_CONTRACT, tx);
    const candidates = await this.findActiveCandidates(ideProcess, params.ideProduct, tx);
    const applicable = candidates.filter(
      (c) =>
        !c.IdeCoveragePlan &&
        (!c.IdeRiskProduct || c.IdeRiskProduct === params.ideRiskProduct) &&
        (!c.IdePlanProduct || c.IdePlanProduct === params.idePlanProduct),
    );
    if (applicable.length === 0) return;

    const ideStateInitial = await this.stateMachine.getInitialState('TContractRequirement');
    const now = new Date();
    for (const candidate of applicable) {
      await tx.tContractRequirement.create({
        data: {
          IdeFileRisk: params.ideFileRisk,
          IdeProductRequirement: candidate.IdeProductRequirement,
          IdeState: ideStateInitial,
          UsrCreation: params.actor,
          TstCreation: now,
          UsrModification: params.actor,
          TstModification: now,
        },
      });
    }
  }

  /**
   * Igual que `resolveContractRequirementsForRisk` pero a nivel de
   * COBERTURA (`IdeCoveragePlan` coincidencia exacta) -- llamado justo
   * después de crear cada `TRiskCoverage`.
   */
  async resolveContractRequirementsForCoverage(
    params: {
      ideFileRisk: string;
      ideRiskCoverage: string;
      ideRiskProduct: string;
      idePlanProduct: string | null;
      ideCoveragePlan: string;
      ideProduct: string;
      actor: string;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ideProcess = await this.resolveProcessId(PROCESS_CODE_CONTRACT, tx);
    const candidates = await this.findActiveCandidates(ideProcess, params.ideProduct, tx);
    const applicable = candidates.filter(
      (c) =>
        c.IdeCoveragePlan === params.ideCoveragePlan &&
        (!c.IdeRiskProduct || c.IdeRiskProduct === params.ideRiskProduct) &&
        (!c.IdePlanProduct || c.IdePlanProduct === params.idePlanProduct),
    );
    if (applicable.length === 0) return;

    const ideStateInitial = await this.stateMachine.getInitialState('TContractRequirement');
    const now = new Date();
    for (const candidate of applicable) {
      await tx.tContractRequirement.create({
        data: {
          IdeFileRisk: params.ideFileRisk,
          IdeRiskCoverage: params.ideRiskCoverage,
          IdeProductRequirement: candidate.IdeProductRequirement,
          IdeState: ideStateInitial,
          UsrCreation: params.actor,
          TstCreation: now,
          UsrModification: params.actor,
          TstModification: now,
        },
      });
    }
  }

  private async findActiveCandidates(
    ideProcess: string,
    ideProduct: string,
    tx: Prisma.TransactionClient,
  ): Promise<SProductRequirement[]> {
    return tx.sProductRequirement.findMany({
      where: { IdeProcess: ideProcess, IdeProduct: ideProduct, SState: { CodState: 'ACTIVO' } },
    });
  }

  private async resolveProcessId(codProcess: string, tx: Prisma.TransactionClient): Promise<string> {
    const row = await tx.sProcess.findFirst({ where: { CodProcess: codProcess } });
    if (!row) throw new NotFoundException(`No existe proceso con código "${codProcess}" (¿falta sembrar SProcess?)`);
    return row.IdeProcess;
  }

  private async resolvePlanProductOf(idePlanProductRisk: string, tx: Prisma.TransactionClient): Promise<string | null> {
    const row = await tx.sPlanProductRisk.findUnique({ where: { IdePlanProductRisk: idePlanProductRisk } });
    return row?.IdePlanProduct ?? null;
  }
}
