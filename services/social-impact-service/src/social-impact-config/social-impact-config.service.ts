import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SSocialImpactConfig } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateSocialImpactConfigDto } from './dto/create-social-impact-config.dto';
import { UpdateSocialImpactConfigDto } from './dto/update-social-impact-config.dto';

const INCLUDE = {
  SProduct: true,
  SState: true,
} as const;

/**
 * `SSocialImpactConfig` -- qué productos participan de Impacto Social
 * (Fase 3, ver docs/02-roadmap.md) y con qué parámetros. Tabla nueva por
 * completo, sin función PL/pgSQL ni equivalente legado que replicar.
 *
 * Es una tabla de configuración sin `Cod`/`Des` propio (una fila por
 * producto, `IdeProduct` único) -- igual criterio que
 * `PlanProductRisksService`: se escribe explícita en vez de usar
 * `CatalogCrudService`, y usa la misma convención de máquina de estados
 * (`IdeState`/`StateMachineService.getStateByCode`) que el resto del
 * sistema para Activo/Inactivo.
 *
 * `ConfigJSON` es el placeholder de Etapa 1 (ver
 * `SocialImpactCalculatorService` en `@ars-platform/shared-common`): hoy
 * solo guarda `{ pctPrimaAdjustment }`, a la espera de que se definan las
 * fórmulas reales de SIP/CFP/SP.
 */
@Injectable()
export class SocialImpactConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(): Promise<SSocialImpactConfig[]> {
    return this.prisma.sSocialImpactConfig.findMany({ include: INCLUDE, orderBy: { TstCreation: 'desc' } });
  }

  async findOne(id: string): Promise<SSocialImpactConfig> {
    const row = await this.prisma.sSocialImpactConfig.findUnique({
      where: { IdeSocialImpactConfig: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe configuración de Impacto Social con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateSocialImpactConfigDto, actor: string): Promise<SSocialImpactConfig> {
    const ideProduct = await this.resolveProduct(dto.codProduct);

    const existing = await this.prisma.sSocialImpactConfig.findFirst({ where: { IdeProduct: ideProduct } });
    if (existing) {
      throw new ConflictException(
        `El producto "${dto.codProduct}" ya tiene una configuración de Impacto Social`,
      );
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sSocialImpactConfig.create({
      data: {
        IdeProduct: ideProduct,
        ConfigJSON: { pctPrimaAdjustment: dto.pctPrimaAdjustment },
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateSocialImpactConfigDto, actor: string): Promise<SSocialImpactConfig> {
    const row = await this.findOne(id);
    if (dto.pctPrimaAdjustment === undefined) {
      return row;
    }

    const currentConfig = (row.ConfigJSON as Record<string, unknown>) ?? {};
    return this.prisma.sSocialImpactConfig.update({
      where: { IdeSocialImpactConfig: id },
      data: {
        ConfigJSON: { ...currentConfig, pctPrimaAdjustment: dto.pctPrimaAdjustment },
        UsrModification: actor,
        TstModification: new Date(),
      },
      include: INCLUDE,
    });
  }

  async setState(id: string, codState: string, actor: string): Promise<SSocialImpactConfig> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sSocialImpactConfig.update({
      where: { IdeSocialImpactConfig: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveProduct(codProduct: string): Promise<string> {
    const product = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct } });
    if (!product) {
      throw new NotFoundException(`No existe producto con código "${codProduct}"`);
    }
    return product.IdeProduct;
  }
}
