import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SProductRequirement } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateProductRequirementDto } from './dto/create-product-requirement.dto';
import { UpdateProductRequirementDto } from './dto/update-product-requirement.dto';

const INCLUDE = {
  SProcess: true,
  SOperation: true,
  SProduct: true,
  SPlanProduct: true,
  SRiskProduct: true,
  SCoveragePlan: true,
  SRequirement: true,
  // Fase 4 (Siniestros), 2026-09-24 -- ver doc-comment de la clase y de
  // `CreateProductRequirementDto`.
  SClaimType: true,
  SClaimEvent: true,
  SState: true,
} as const;

/**
 * `SProductRequirement` -- la CONFIGURACIÓN de qué documentos exige un
 * producto (feature "Requisitos", investigada y acordada con el usuario
 * 2026-09-24 tras terminar "flujos de proceso configurables por
 * producto"; ver docs/02-roadmap.md).
 *
 * Hallazgos clave de la investigación (no repetir sin releer esto):
 *  - Sin código propio (`Cod...`) -- a diferencia de `SProductProcessFlow`,
 *    esta tabla NO usa `CatalogCrudService`; es bespoke, mismo criterio
 *    que `FlowStepsService`/`CoveragePlansService` (ver sus doc-comments).
 *  - `@@unique([IdeProcess, IdeProduct, IdeRequirement])`: para un
 *    Proceso+Producto dado, cada `SRequirement` (tipo de documento)
 *    aparece COMO MÁXIMO UNA VEZ. Sus columnas opcionales
 *    (`IdePlanProduct`/`IdeRiskProduct`/`IdeCoveragePlan`) ESTRECHAN esa
 *    única fila, no compiten como alternativas -- por eso la resolución
 *    real (en `underwriting-service`, no acá) combina TODAS las filas
 *    aplicables vía comodín NULL, igual que
 *    `PrismaCalculationRuleRepository.findApplicableRules` -- NO elige
 *    una sola "ganadora" como `ProcessFlowResolver`.
 *  - `IdeProcess` es obligatorio: en la base sembrada real los
 *    `CodProcess` relevantes son `COTIZACION` y `CONTRATACION`
 *    (confirmado con el usuario, no hay constante commiteada en el repo
 *    -- ver `PROCESS_CODE_QUOTE`/`PROCESS_CODE_CONTRACT` en
 *    `underwriting-service/src/requirements/requirements.constants.ts`).
 *  - `IdeClaimType`/`IdeClaimEvent` (columnas de Siniestros) se agregaron
 *    al DTO de este CRUD el 2026-09-24 (Fase 4, Etapa 1) -- ver
 *    `CreateProductRequirementDto` y `ClaimRequirementsService` en
 *    `claims-service` (motor de resolución del lado de Siniestros).
 *    `IdeCoverageGuarantee` (garantías, Etapa 2) sigue sin exponerse.
 *  - Etapa 1 = checklist SIN archivo real: no existe mecanismo de
 *    subida de archivos en todo el monorepo (confirmado por búsqueda),
 *    así que `IndApplyOCR` se guarda pero no dispara ninguna ejecución
 *    todavía (mismo criterio que columnas reservadas para etapas
 *    futuras en Impacto Social).
 */
@Injectable()
export class ProductRequirementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(codProduct?: string, codProcess?: string): Promise<SProductRequirement[]> {
    const where: Prisma.SProductRequirementWhereInput = {};
    if (codProduct) where.SProduct = { CodProduct: codProduct };
    if (codProcess) where.SProcess = { CodProcess: codProcess };
    return this.prisma.sProductRequirement.findMany({ where, include: INCLUDE, orderBy: { Order: 'asc' } });
  }

  async findOne(id: string): Promise<SProductRequirement> {
    const row = await this.prisma.sProductRequirement.findUnique({
      where: { IdeProductRequirement: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe requisito de producto con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateProductRequirementDto, actor: string): Promise<SProductRequirement> {
    const [
      ideProcess,
      ideOperation,
      ideProduct,
      idePlanProduct,
      ideRiskProduct,
      ideCoveragePlan,
      ideClaimType,
      ideClaimEvent,
      ideRequirement,
    ] = await Promise.all([
      this.resolveProcess(dto.codProcess),
      dto.codOperation ? this.resolveOperation(dto.codOperation) : Promise.resolve(null),
      this.resolveProduct(dto.codProduct),
      dto.codPlanProduct ? this.resolvePlanProduct(dto.codPlanProduct) : Promise.resolve(null),
      dto.codRiskProduct ? this.resolveRiskProduct(dto.codRiskProduct) : Promise.resolve(null),
      dto.ideCoveragePlan ? this.assertCoveragePlan(dto.ideCoveragePlan) : Promise.resolve(null),
      dto.codClaimType ? this.resolveClaimType(dto.codClaimType) : Promise.resolve(null),
      dto.codClaimEvent ? this.resolveClaimEvent(dto.codClaimEvent) : Promise.resolve(null),
      this.resolveRequirement(dto.codRequirement),
    ]);

    const existing = await this.prisma.sProductRequirement.findFirst({
      where: { IdeProcess: ideProcess, IdeProduct: ideProduct, IdeRequirement: ideRequirement },
    });
    if (existing) {
      throw new NotFoundException(
        'Ya existe ese requisito configurado para ese proceso+producto (ver restricción única de SProductRequirement)',
      );
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sProductRequirement.create({
      data: {
        IdeProcess: ideProcess,
        IdeOperation: ideOperation,
        IdeProduct: ideProduct,
        IdePlanProduct: idePlanProduct,
        IdeRiskProduct: ideRiskProduct,
        IdeCoveragePlan: ideCoveragePlan,
        IdeClaimType: ideClaimType,
        IdeClaimEvent: ideClaimEvent,
        IdeRequirement: ideRequirement,
        DesShort: dto.desShort,
        DesLarge: dto.desLarge,
        IndMandatory: dto.indMandatory,
        IndReviewable: dto.indReviewable,
        CodRequirementType: dto.codRequirementType,
        CodDocumentType: dto.codDocumentType,
        IndApplyOCR: dto.indApplyOCR,
        Order: dto.order,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateProductRequirementDto, actor: string): Promise<SProductRequirement> {
    await this.findOne(id);
    const data: Record<string, unknown> = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.codProcess !== undefined) data.IdeProcess = await this.resolveProcess(dto.codProcess);
    if (dto.codOperation !== undefined) {
      data.IdeOperation = dto.codOperation ? await this.resolveOperation(dto.codOperation) : null;
    }
    if (dto.codProduct !== undefined) data.IdeProduct = await this.resolveProduct(dto.codProduct);
    if (dto.codPlanProduct !== undefined) {
      data.IdePlanProduct = dto.codPlanProduct ? await this.resolvePlanProduct(dto.codPlanProduct) : null;
    }
    if (dto.codRiskProduct !== undefined) {
      data.IdeRiskProduct = dto.codRiskProduct ? await this.resolveRiskProduct(dto.codRiskProduct) : null;
    }
    if (dto.ideCoveragePlan !== undefined) {
      data.IdeCoveragePlan = dto.ideCoveragePlan ? await this.assertCoveragePlan(dto.ideCoveragePlan) : null;
    }
    if (dto.codClaimType !== undefined) {
      data.IdeClaimType = dto.codClaimType ? await this.resolveClaimType(dto.codClaimType) : null;
    }
    if (dto.codClaimEvent !== undefined) {
      data.IdeClaimEvent = dto.codClaimEvent ? await this.resolveClaimEvent(dto.codClaimEvent) : null;
    }
    if (dto.codRequirement !== undefined) data.IdeRequirement = await this.resolveRequirement(dto.codRequirement);
    if (dto.desShort !== undefined) data.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) data.DesLarge = dto.desLarge;
    if (dto.indMandatory !== undefined) data.IndMandatory = dto.indMandatory;
    if (dto.indReviewable !== undefined) data.IndReviewable = dto.indReviewable;
    if (dto.codRequirementType !== undefined) data.CodRequirementType = dto.codRequirementType;
    if (dto.codDocumentType !== undefined) data.CodDocumentType = dto.codDocumentType;
    if (dto.indApplyOCR !== undefined) data.IndApplyOCR = dto.indApplyOCR;
    if (dto.order !== undefined) data.Order = dto.order;

    return this.prisma.sProductRequirement.update({ where: { IdeProductRequirement: id }, data, include: INCLUDE });
  }

  async setState(id: string, codState: string, actor: string): Promise<SProductRequirement> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sProductRequirement.update({
      where: { IdeProductRequirement: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveProcess(codProcess: string): Promise<string> {
    const row = await this.prisma.sProcess.findFirst({ where: { CodProcess: codProcess } });
    if (!row) throw new NotFoundException(`No existe proceso con código "${codProcess}"`);
    return row.IdeProcess;
  }

  private async resolveOperation(codOperation: string): Promise<string> {
    const row = await this.prisma.sOperation.findFirst({ where: { CodOperation: codOperation } });
    if (!row) throw new NotFoundException(`No existe operación con código "${codOperation}"`);
    return row.IdeOperation;
  }

  private async resolveProduct(codProduct: string): Promise<string> {
    const row = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct } });
    if (!row) throw new NotFoundException(`No existe producto con código "${codProduct}"`);
    return row.IdeProduct;
  }

  private async resolvePlanProduct(codPlanProduct: string): Promise<string> {
    const row = await this.prisma.sPlanProduct.findFirst({ where: { CodPlanProduct: codPlanProduct } });
    if (!row) throw new NotFoundException(`No existe plan de producto con código "${codPlanProduct}"`);
    return row.IdePlanProduct;
  }

  private async resolveRiskProduct(codRiskProduct: string): Promise<string> {
    const row = await this.prisma.sRiskProduct.findFirst({ where: { CodRiskProduct: codRiskProduct } });
    if (!row) throw new NotFoundException(`No existe riesgo de producto con código "${codRiskProduct}"`);
    return row.IdeRiskProduct;
  }

  private async resolveRequirement(codRequirement: string): Promise<string> {
    const row = await this.prisma.sRequirement.findFirst({ where: { CodRequirement: codRequirement } });
    if (!row) throw new NotFoundException(`No existe requisito con código "${codRequirement}"`);
    return row.IdeRequirement;
  }

  /** Sin código propio (ver doc-comment de la clase) -- solo valida que exista. */
  private async assertCoveragePlan(ideCoveragePlan: string): Promise<string> {
    const row = await this.prisma.sCoveragePlan.findUnique({ where: { IdeCoveragePlan: ideCoveragePlan } });
    if (!row) throw new NotFoundException(`No existe cobertura de plan con id "${ideCoveragePlan}"`);
    return row.IdeCoveragePlan;
  }

  private async resolveClaimType(codClaimType: string): Promise<string> {
    const row = await this.prisma.sClaimType.findFirst({ where: { CodClaimType: codClaimType } });
    if (!row) throw new NotFoundException(`No existe tipo de siniestro con código "${codClaimType}"`);
    return row.IdeClaimType;
  }

  private async resolveClaimEvent(codClaimEvent: string): Promise<string> {
    const row = await this.prisma.sClaimEvent.findFirst({ where: { CodClaimEvent: codClaimEvent } });
    if (!row) throw new NotFoundException(`No existe evento de siniestro con código "${codClaimEvent}"`);
    return row.IdeClaimEvent;
  }
}
