import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateGuaranteeProvisionDto } from './dto/create-guarantee-provision.dto';

/**
 * Uso de garantías (`TGuaranteeProvision`) -- Fase 4, Etapa 2,
 * 2026-09-24. Decisión del usuario: el contador de usos
 * (`SCoverageGuarantee.NumApplyUse` = máximo permitido) se reinicia en
 * cada VIGENCIA del contrato -- cada renovación crea un `TContractFile`
 * nuevo (ver su doc-comment), y `TClaim.IdeContractFile` ya apunta a esa
 * vigencia concreta, así que "cuánto se lleva usado" se calcula sumando
 * `TGuaranteeProvision.NumApplyUse` de todos los siniestros que
 * comparten el MISMO `TContractFile`, sin necesidad de una tabla nueva
 * de conteo. Si el nuevo uso excede el máximo, se bloquea la operación
 * (decisión explícita del usuario: "si se excede, bloqueo").
 *
 * Nace directamente "Activo" (`CATALOG_ACTIVE_ENTITIES` en
 * `seed-contract-testing-fixtures.js`) -- registra un uso ya evaluado
 * por el ajustador, no un borrador.
 */
@Injectable()
export class GuaranteeProvisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAllForCoverageProvision(ideCoverageProvision: string) {
    return this.prisma.tGuaranteeProvision.findMany({
      where: { IdeCoverageProvision: ideCoverageProvision },
      include: { SCoverageGuarantee: { include: { SGuarantee: true } }, SState: true },
      orderBy: { TstCreation: 'asc' },
    });
  }

  async createForCoverageProvision(ideCoverageProvision: string, dto: CreateGuaranteeProvisionDto, actor: string) {
    const coverageProvision = await this.prisma.tCoverageProvision.findUnique({
      where: { IdeCoverageProvision: ideCoverageProvision },
      include: { TClaimRisk: { include: { TClaimFile: { include: { TClaim: true } } } } },
    });
    if (!coverageProvision) throw new NotFoundException(`No existe provisión de cobertura con id "${ideCoverageProvision}"`);

    const guarantee = await this.prisma.sCoverageGuarantee.findUnique({
      where: { IdeCoverageGuarantee: dto.ideCoverageGuarantee },
    });
    if (!guarantee) throw new NotFoundException(`No existe garantía de cobertura con id "${dto.ideCoverageGuarantee}"`);

    const ideContractFile = coverageProvision.TClaimRisk.TClaimFile.TClaim.IdeContractFile;
    const requestedUse = dto.numApplyUse ?? 0;

    if (guarantee.NumApplyUse !== null && requestedUse > 0) {
      const usedSoFar = await this.sumUsageInSameVigencia(dto.ideCoverageGuarantee, ideContractFile);
      const max = Number(guarantee.NumApplyUse);
      if (usedSoFar + requestedUse > max) {
        throw new BadRequestException(
          `Se excede el máximo de usos de esta garantía en la vigencia actual (usados: ${usedSoFar}, máximo: ${max}, solicitados: ${requestedUse})`,
        );
      }
    }

    const activeStateId = await this.stateMachine.getInitialState('TGuaranteeProvision');
    const now = new Date();
    return this.prisma.tGuaranteeProvision.create({
      data: {
        IdeCoverageProvision: ideCoverageProvision,
        IdeCoverageGuarantee: dto.ideCoverageGuarantee,
        InvoicedAmount: dto.invoicedAmount,
        CoveredAmount: dto.coveredAmount,
        ApprovedAmount: dto.approvedAmount,
        IndemnifiedAmount: dto.indemnifiedAmount,
        NoCoveredAmount: dto.noCoveredAmount,
        ManualDeductibleAmount: dto.manualDeductibleAmount,
        NumApplyUse: dto.numApplyUse,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: { SCoverageGuarantee: { include: { SGuarantee: true } }, SState: true },
    });
  }

  /** Suma `NumApplyUse` de todas las `TGuaranteeProvision` de la misma garantía, en siniestros del mismo `TContractFile` (misma vigencia). */
  private async sumUsageInSameVigencia(ideCoverageGuarantee: string, ideContractFile: string): Promise<number> {
    const rows = await this.prisma.tGuaranteeProvision.findMany({
      where: {
        IdeCoverageGuarantee: ideCoverageGuarantee,
        TCoverageProvision: { TClaimRisk: { TClaimFile: { TClaim: { IdeContractFile: ideContractFile } } } },
      },
      select: { NumApplyUse: true },
    });
    return rows.reduce((sum, row) => sum + Number(row.NumApplyUse ?? 0), 0);
  }
}
