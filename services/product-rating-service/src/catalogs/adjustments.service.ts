import { Injectable } from '@nestjs/common';
import { PrismaService, SAdjustment } from '@ars-platform/database';
import { StateMachineService, CatalogCrudService } from '@ars-platform/shared-common';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { UpdateAdjustmentDto } from './dto/update-adjustment.dto';

/**
 * Catálogo genérico de recargos/descuentos (docs/02-roadmap.md, Fase 2
 * backlog ítem 7). Hasta ahora el único `codAdjustment` real
 * (`SOCIAL_IMPACT`, ver `AdjustmentValueResolver`/
 * `PrismaAdjustmentValueResolver` en `packages/database`) tenía su
 * propia tabla de configuración dedicada (`SSocialImpactConfig`) con su
 * propio cálculo (`social-impact-service`). Esta tabla es la respuesta
 * genérica para cualquier recargo/descuento SIMPLE (fidelidad,
 * multi-póliza, siniestralidad, etc.): un admin lo da de alta acá, sin
 * escribir ningún código ni tabla nueva, y `PrismaAdjustmentValueResolver`
 * lo resuelve automáticamente (ver su doc-comment) -- el `default` del
 * `switch` ya busca ahí cualquier `codAdjustment` que no tenga un `case`
 * dedicado.
 *
 * Para que el ajuste efectivamente modifique `PrimaTotal` de un producto,
 * la fórmula de ese producto (pantalla "Reglas de cálculo") tiene que
 * referenciar `adjustment('COD')` -- igual que ya se hizo para
 * `'SOCIAL_IMPACT'` (`apply-social-impact-adjustment-to-prima-total.js`).
 * Esto es deliberado, no una limitación a resolver después: igual que
 * cualquier otra fórmula de `SCalculationRule`, es configuración de
 * producto, no código -- el admin decide qué productos llevan qué
 * ajuste editando su fórmula, sin tocar TypeScript.
 *
 * Mismo molde "Cod/Des simple" que los otros 8 catálogos de esta
 * carpeta (ver `CatalogCrudService` en `shared-common`) -- `IndAutomatic`
 * es el único campo que no es texto/número simple, ver su doc-comment en
 * `CreateAdjustmentDto`.
 */
@Injectable()
export class AdjustmentsService {
  private readonly crud: CatalogCrudService<SAdjustment>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SAdjustment>(
      this.prisma.sAdjustment,
      'CodAdjustment',
      'DesAdjustment',
      'IdeAdjustment',
      'recargo/descuento',
      { SState: true },
    );
  }

  findAll(): Promise<SAdjustment[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SAdjustment> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateAdjustmentDto, actor: string): Promise<SAdjustment> {
    const extra = this.buildExtra(dto);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codAdjustment, dto.desAdjustment, extra, activeStateId, actor);
  }

  async update(id: string, dto: UpdateAdjustmentDto, actor: string): Promise<SAdjustment> {
    const extra = this.buildExtra(dto);
    return this.crud.update(id, dto.desAdjustment, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SAdjustment> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private buildExtra(dto: CreateAdjustmentDto | UpdateAdjustmentDto): Record<string, unknown> {
    const extra: Record<string, unknown> = {};
    if (dto.pctAdjustment !== undefined) extra.PctAdjustment = dto.pctAdjustment;
    if (dto.indAutomatic !== undefined) extra.IndAutomatic = dto.indAutomatic;
    return extra;
  }
}
