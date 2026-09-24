import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SProductRequirement } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';

const REQUIREMENT_INCLUDE = {
  SProductRequirement: { include: { SRequirement: true } },
  SState: true,
} as const;

/**
 * Checklist de documentos exigidos para un siniestro (`TClaimRequirement`)
 * -- instancia PROPIA de `claims-service` del mismo motor de resolución
 * que `RequirementsService` en `underwriting-service` (ver su
 * doc-comment para el algoritmo original), NO compartida/importada --
 * mismo criterio de "instancia propia por consumidor" que el resto del
 * proyecto (cada servicio resuelve `SProductRequirement` contra SU
 * propio árbol de entidades).
 *
 * Diferencias clave frente al motor de cotización/contrato:
 *
 *  - Filtra candidatos por `IdeClaimType` (obligatorio) + `IdeClaimEvent`
 *    (comodín NULL) en vez de por `IdeProcess` -- ninguno de los
 *    `CodProcess` reales de la base (COTIZACION/SUPLEMENTO/ANULACION/
 *    RENOVACION/CONTRATACION/GENERICO) representa "Siniestro", y
 *    `SProductRequirement.IdeProcess` es NOT NULL, así que toda fila
 *    configurada para Siniestros debe cargarse igual con ALGÚN
 *    `CodProcess` -- decisión de esta implementación (no confirmada con
 *    el usuario, documentada acá para que se pueda ajustar si hace
 *    falta): usar `GENERICO` en la pantalla de configuración
 *    (`ProductRequirementsComponent`) para esas filas. Este resolver
 *    IGNORA el valor de `IdeProcess` por completo -- filtra pura y
 *    exclusivamente por `IdeClaimType`/`IdeClaimEvent`, mismo criterio
 *    que el resolver de cotización/contrato ignora las columnas de
 *    Siniestros.
 *  - NO soporta alcance a nivel de COBERTURA (`IdeCoveragePlan`): a
 *    diferencia de `TContractRequirement` (que tiene `IdeRiskCoverage`
 *    opcional), `TClaimRequirement` solo tiene `IdeClaimFile`+
 *    `IdeClaimRisk` (ver `@@unique` real de la tabla) -- no hay dónde
 *    "colgar" un requisito específico de una cobertura puntual. Los
 *    candidatos con `IdeCoveragePlan` fijado se DESCARTAN acá (quedan
 *    sin resolver para Siniestros); si hiciera falta esa granularidad
 *    en el futuro, requiere agregar la columna a `TClaimRequirement`
 *    (fuera de alcance de la Etapa 1).
 *  - `TstRequest`/`TstReception`/`IdeStateReview` son NOT NULL (a
 *    diferencia de `TQuoteRequirement`/`TContractRequirement`, que
 *    resuelven "entregado" con un flag en `Data` porque no tenían
 *    ninguna columna real para eso). Acá sí hay columnas reales, pero
 *    Etapa 1 no diseña el flujo de revisión real (eso es Etapa 2,
 *    aprobación) -- así que, al crear la fila, se usa una convención
 *    simple y documentada: `TstRequest = TstReception = ahora` (mismo
 *    valor = "todavía no se recibió el documento", `IdeStateReview` en
 *    el mismo estado inicial "sin transición" que `IdeState`). Cuando
 *    el documento realmente llega, `setReceived` actualiza
 *    `TstReception` a la fecha real -- esa es la señal de "entregado"
 *    para Etapa 1 (no se toca `IdeStateReview` todavía; el flujo de
 *    revisión/aprobación real queda para Etapa 2).
 */
@Injectable()
export class ClaimRequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  /**
   * Resuelve y crea (idempotente) los `TClaimRequirement` de UN riesgo de
   * siniestro (`TClaimRisk`) ya creado. Llamado desde `ClaimsService.declare`
   * justo después de crear cada `TClaimRisk`, dentro de la misma transacción.
   */
  async resolveForClaimRisk(
    params: {
      ideClaimFile: string;
      ideClaimRisk: string;
      ideClaimType: string;
      ideClaimEvent: string;
      ideProduct: string;
      ideRiskProduct: string;
      idePlanProduct: string | null;
      actor: string;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const candidates = await this.findActiveCandidates(params.ideProduct, params.ideClaimType, tx);
    const applicable = candidates.filter(
      (c) =>
        !c.IdeCoveragePlan &&
        (!c.IdeClaimEvent || c.IdeClaimEvent === params.ideClaimEvent) &&
        (!c.IdeRiskProduct || c.IdeRiskProduct === params.ideRiskProduct) &&
        (!c.IdePlanProduct || c.IdePlanProduct === params.idePlanProduct),
    );
    if (applicable.length === 0) return;

    const existing = await tx.tClaimRequirement.findMany({ where: { IdeClaimRisk: params.ideClaimRisk } });
    const already = new Set(existing.map((r) => r.IdeProductRequirement));

    const ideStateInitial = await this.stateMachine.getInitialState('TClaimRequirement');
    const now = new Date();
    for (const candidate of applicable) {
      if (already.has(candidate.IdeProductRequirement)) continue;
      await tx.tClaimRequirement.create({
        data: {
          IdeClaimFile: params.ideClaimFile,
          IdeClaimRisk: params.ideClaimRisk,
          IdeProductRequirement: candidate.IdeProductRequirement,
          TstRequest: now,
          TstReception: now,
          IdeStateReview: ideStateInitial,
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
   * Re-resuelve (por si se agregó un `SProductRequirement` nuevo después
   * de declarado el siniestro) y lista el checklist completo de un
   * `TClaimFile`. Usado por `GET /claims/claim-files/:id/requirements`.
   */
  async listForClaimFile(ideClaimFile: string, actor: string) {
    const claimFile = await this.prisma.tClaimFile.findUniqueOrThrow({
      where: { IdeClaimFile: ideClaimFile },
      include: {
        TClaim: { include: { TContractFile: { include: { TContract: true } } } },
        TClaimRisk: { include: { TFileRisk: true } },
      },
    });

    for (const risk of claimFile.TClaimRisk) {
      const idePlanProduct = await this.resolvePlanProductOf(risk.TFileRisk.IdePlanProductRisk);
      await this.resolveForClaimRisk({
        ideClaimFile,
        ideClaimRisk: risk.IdeClaimRisk,
        ideClaimType: claimFile.TClaim.IdeClaimType,
        ideClaimEvent: claimFile.IdeClaimEvent,
        ideProduct: claimFile.TClaim.TContractFile.TContract.IdeProduct,
        ideRiskProduct: risk.TFileRisk.IdeRiskProduct,
        idePlanProduct,
        actor,
      });
    }

    return this.prisma.tClaimRequirement.findMany({
      where: { IdeClaimFile: ideClaimFile },
      include: REQUIREMENT_INCLUDE,
    });
  }

  /** Marca un `TClaimRequirement` como recibido -- ver el doc-comment de la clase sobre la convención `TstRequest === TstReception` = "pendiente". */
  async setReceived(ideClaimRequirement: string, tstReception: Date | undefined, actor: string) {
    const row = await this.prisma.tClaimRequirement.findUnique({ where: { IdeClaimRequirement: ideClaimRequirement } });
    if (!row) throw new NotFoundException(`No existe requisito de siniestro con id "${ideClaimRequirement}"`);
    return this.prisma.tClaimRequirement.update({
      where: { IdeClaimRequirement: ideClaimRequirement },
      data: { TstReception: tstReception ?? new Date(), UsrModification: actor, TstModification: new Date() },
      include: REQUIREMENT_INCLUDE,
    });
  }

  private async findActiveCandidates(
    ideProduct: string,
    ideClaimType: string,
    tx: Prisma.TransactionClient,
  ): Promise<SProductRequirement[]> {
    return tx.sProductRequirement.findMany({
      where: { IdeProduct: ideProduct, IdeClaimType: ideClaimType, SState: { CodState: 'ACTIVO' } },
    });
  }

  private async resolvePlanProductOf(idePlanProductRisk: string): Promise<string | null> {
    const row = await this.prisma.sPlanProductRisk.findUnique({ where: { IdePlanProductRisk: idePlanProductRisk } });
    return row?.IdePlanProduct ?? null;
  }
}
