import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaProcessFlowResolver, PrismaService, SProductProcessFlow } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateProductProcessFlowDto } from './dto/create-product-process-flow.dto';
import { UpdateProductProcessFlowDto } from './dto/update-product-process-flow.dto';
import { ResolveStepsQueryDto } from './dto/resolve-steps-query.dto';

const INCLUDE = {
  SProcessFlow: true,
  SProduct: true,
  SRiskProduct: true,
  SDistributionChannel: true,
  SDistributionWay: true,
  SState: true,
} as const;

/**
 * `SProductProcessFlow` -- asigna un `SProcessFlow` a un producto/canal
 * (+ opcionalmente riesgo de producto/vía de distribución como
 * comodines NULL). Es la pieza que faltaba de "flujos de contratación
 * configurables por producto" que el usuario señaló (2026-09-23): el
 * resto del motor (`SStep`/`SScreen`/`SProcessFlow`/`SFlowStep`) ya
 * tenía CRUD desde la fase del motor de atributos, pero nunca existió
 * ninguna fila ni pantalla que conectara un flujo con un producto real
 * -- ver el doc-comment de `ProcessFlowResolver` en
 * `@ars-platform/shared-common` para el análisis completo y el alcance
 * acordado con el usuario.
 *
 * A diferencia de `SProcessFlow`/`SStep`/`SScreen` (catálogos simples
 * sin FKs propias) y de `SFlowStep` (unión sin código propio, escrita a
 * mano), esta entidad SÍ tiene su propio Cod/Des, así que usa
 * `CatalogCrudService` con `extra` para sus 4 FKs por código -- mismo
 * patrón que `RisksService.resolveRiskLevel` en product-rating-service.
 */
@Injectable()
export class ProductProcessFlowsService {
  private readonly crud: CatalogCrudService<SProductProcessFlow>;
  private readonly resolver: PrismaProcessFlowResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SProductProcessFlow>(
      this.prisma.sProductProcessFlow,
      'CodProductProcessFlow',
      'DesProductProcessFlow',
      'IdeProductProcessFlow',
      'asignación de flujo de proceso',
      INCLUDE,
    );
    this.resolver = new PrismaProcessFlowResolver(this.prisma);
  }

  findAll(): Promise<SProductProcessFlow[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SProductProcessFlow> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateProductProcessFlowDto, actor: string): Promise<SProductProcessFlow> {
    const [ideProcessFlow, ideProduct, ideDistributionChannel, ideRiskProduct, ideDistributionWay] = await Promise.all([
      this.resolveProcessFlow(dto.codProcessFlow),
      this.resolveProduct(dto.codProduct),
      this.resolveDistributionChannel(dto.codDistributionChannel),
      dto.codRiskProduct ? this.resolveRiskProduct(dto.codRiskProduct) : Promise.resolve(null),
      dto.codDistributionWay ? this.resolveDistributionWay(dto.codDistributionWay) : Promise.resolve(null),
    ]);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codProductProcessFlow,
      dto.desProductProcessFlow,
      {
        IdeProcessFlow: ideProcessFlow,
        IdeProduct: ideProduct,
        IdeDistributionChannel: ideDistributionChannel,
        IdeRiskProduct: ideRiskProduct,
        IdeDistributionWay: ideDistributionWay,
      },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateProductProcessFlowDto, actor: string): Promise<SProductProcessFlow> {
    const extra: Record<string, unknown> = {};
    if (dto.codProcessFlow !== undefined) {
      extra.IdeProcessFlow = await this.resolveProcessFlow(dto.codProcessFlow);
    }
    if (dto.codProduct !== undefined) {
      extra.IdeProduct = await this.resolveProduct(dto.codProduct);
    }
    if (dto.codDistributionChannel !== undefined) {
      extra.IdeDistributionChannel = await this.resolveDistributionChannel(dto.codDistributionChannel);
    }
    if (dto.codRiskProduct !== undefined) {
      extra.IdeRiskProduct = dto.codRiskProduct ? await this.resolveRiskProduct(dto.codRiskProduct) : null;
    }
    if (dto.codDistributionWay !== undefined) {
      extra.IdeDistributionWay = dto.codDistributionWay ? await this.resolveDistributionWay(dto.codDistributionWay) : null;
    }
    return this.crud.update(id, dto.desProductProcessFlow, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SProductProcessFlow> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  /**
   * Endpoint de conveniencia para la pantalla de administración
   * ("probar" una combinación producto/canal antes de guardar nada en
   * el wizard real): delega en `PrismaProcessFlowResolver`, el MISMO
   * componente que usan los consumidores reales
   * (`underwriting-service`), así que el resultado que ve el
   * administrador es exactamente el que aplicará en la cotización.
   */
  async resolveSteps(query: ResolveStepsQueryDto): Promise<{ codProcessFlow: string | null; activeSteps: string[] }> {
    const [ideProduct, ideDistributionChannel, ideRiskProduct, ideDistributionWay] = await Promise.all([
      this.resolveProduct(query.codProduct),
      this.resolveDistributionChannel(query.codDistributionChannel),
      query.codRiskProduct ? this.resolveRiskProduct(query.codRiskProduct) : Promise.resolve(undefined),
      query.codDistributionWay ? this.resolveDistributionWay(query.codDistributionWay) : Promise.resolve(undefined),
    ]);
    const resolution = await this.resolver.resolveActiveSteps({
      ideProduct,
      ideDistributionChannel,
      ideRiskProduct: ideRiskProduct ?? undefined,
      ideDistributionWay: ideDistributionWay ?? undefined,
    });
    if (resolution.ideProcessFlow === null) {
      return { codProcessFlow: null, activeSteps: [] };
    }
    const processFlow = await this.prisma.sProcessFlow.findUnique({
      where: { IdeProcessFlow: resolution.ideProcessFlow },
    });
    return { codProcessFlow: processFlow?.CodProcessFlow ?? null, activeSteps: resolution.activeSteps };
  }

  private async resolveProcessFlow(codProcessFlow: string): Promise<string> {
    const row = await this.prisma.sProcessFlow.findFirst({ where: { CodProcessFlow: codProcessFlow } });
    if (!row) throw new NotFoundException(`No existe flujo de proceso con código "${codProcessFlow}"`);
    return row.IdeProcessFlow;
  }

  private async resolveProduct(codProduct: string): Promise<string> {
    const row = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct } });
    if (!row) throw new NotFoundException(`No existe producto con código "${codProduct}"`);
    return row.IdeProduct;
  }

  private async resolveRiskProduct(codRiskProduct: string): Promise<string> {
    const row = await this.prisma.sRiskProduct.findFirst({ where: { CodRiskProduct: codRiskProduct } });
    if (!row) throw new NotFoundException(`No existe riesgo de producto con código "${codRiskProduct}"`);
    return row.IdeRiskProduct;
  }

  private async resolveDistributionChannel(codDistributionChannel: string): Promise<string> {
    const row = await this.prisma.sDistributionChannel.findFirst({
      where: { CodDistributionChannel: codDistributionChannel },
    });
    if (!row) throw new NotFoundException(`No existe canal de distribución con código "${codDistributionChannel}"`);
    return row.IdeDistributionChannel;
  }

  private async resolveDistributionWay(codDistributionWay: string): Promise<string> {
    const row = await this.prisma.sDistributionWay.findFirst({ where: { CodDistributionWay: codDistributionWay } });
    if (!row) throw new NotFoundException(`No existe vía de distribución con código "${codDistributionWay}"`);
    return row.IdeDistributionWay;
  }
}
