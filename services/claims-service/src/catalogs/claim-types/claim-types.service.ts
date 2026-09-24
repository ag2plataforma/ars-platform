import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SClaimType } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateClaimTypeDto } from './dto/create-claim-type.dto';
import { UpdateClaimTypeDto } from './dto/update-claim-type.dto';

const INCLUDE = {
  SProduct: true,
  SPlanProduct: true,
  SRiskProduct: true,
  SCoverage: true,
  SState: true,
} as const;

/**
 * `SClaimType` -- catálogo de tipos de siniestro (ej. "Daños materiales",
 * "Robo", "Responsabilidad civil"), primer catálogo real de la Fase 4
 * (Siniestros), Etapa 1 -- ver el doc-comment de `ClaimsService` para el
 * diseño completo acordado con el usuario 2026-09-24. Investigación
 * confirmó CERO funciones PL/pgSQL y CERO datos reales para todo el
 * dominio (`packages/database/scripts/investigate-claims-engine.js`) --
 * a diferencia de `SRequirement`/`SProductRequirement`, este catálogo se
 * diseña desde cero, no se reversa de un motor legado.
 *
 * A diferencia de `SRequirement` (sin FK propia), esta tabla sí tiene
 * FKs (una obligatoria -- `IdeProduct` -- y tres opcionales de alcance:
 * `IdePlanProduct`/`IdeRiskProduct`/`IdeCoverage`), mismo criterio que
 * `RisksService` (`CatalogCrudService` + resolución de FK por código en
 * el propio servicio, ver `resolve*` más abajo) -- no como
 * `SProductRequirement`, que es bespoke por tener una restricción única
 * multi-columna real que arbitrar.
 */
@Injectable()
export class ClaimTypesService {
  private readonly crud: CatalogCrudService<SClaimType>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SClaimType>(
      this.prisma.sClaimType,
      'CodClaimType',
      'DesClaimType',
      'IdeClaimType',
      'tipo de siniestro',
      INCLUDE,
    );
  }

  findAll(): Promise<SClaimType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SClaimType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateClaimTypeDto, actor: string): Promise<SClaimType> {
    const [ideProduct, idePlanProduct, ideRiskProduct, ideCoverage] = await Promise.all([
      this.resolveProduct(dto.codProduct),
      dto.codPlanProduct ? this.resolvePlanProduct(dto.codPlanProduct) : Promise.resolve(null),
      dto.codRiskProduct ? this.resolveRiskProduct(dto.codRiskProduct) : Promise.resolve(null),
      dto.codCoverage ? this.resolveCoverage(dto.codCoverage) : Promise.resolve(null),
    ]);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codClaimType,
      dto.desClaimType,
      {
        IdeProduct: ideProduct,
        IdePlanProduct: idePlanProduct,
        IdeRiskProduct: ideRiskProduct,
        IdeCoverage: ideCoverage,
        DesShort: dto.desShort,
        DesLarge: dto.desLarge,
        NumClaimsPerYear: dto.numClaimsPerYear,
        InitialProvisionAmount: dto.initialProvisionAmount,
        NumDeadLineReport: dto.numDeadLineReport,
        Order: dto.order,
      },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateClaimTypeDto, actor: string): Promise<SClaimType> {
    const extra: Record<string, unknown> = {};
    if (dto.codProduct !== undefined) extra.IdeProduct = await this.resolveProduct(dto.codProduct);
    if (dto.codPlanProduct !== undefined) {
      extra.IdePlanProduct = dto.codPlanProduct ? await this.resolvePlanProduct(dto.codPlanProduct) : null;
    }
    if (dto.codRiskProduct !== undefined) {
      extra.IdeRiskProduct = dto.codRiskProduct ? await this.resolveRiskProduct(dto.codRiskProduct) : null;
    }
    if (dto.codCoverage !== undefined) {
      extra.IdeCoverage = dto.codCoverage ? await this.resolveCoverage(dto.codCoverage) : null;
    }
    if (dto.desShort !== undefined) extra.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) extra.DesLarge = dto.desLarge;
    if (dto.numClaimsPerYear !== undefined) extra.NumClaimsPerYear = dto.numClaimsPerYear;
    if (dto.initialProvisionAmount !== undefined) extra.InitialProvisionAmount = dto.initialProvisionAmount;
    if (dto.numDeadLineReport !== undefined) extra.NumDeadLineReport = dto.numDeadLineReport;
    if (dto.order !== undefined) extra.Order = dto.order;
    return this.crud.update(id, dto.desClaimType, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SClaimType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
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

  private async resolveCoverage(codCoverage: string): Promise<string> {
    const row = await this.prisma.sCoverage.findFirst({ where: { CodCoverage: codCoverage } });
    if (!row) throw new NotFoundException(`No existe cobertura con código "${codCoverage}"`);
    return row.IdeCoverage;
  }
}
