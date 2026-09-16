import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SRiskLevel } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from './catalog-crud.service';
import { CreateRiskLevelDto } from './dto/create-risk-level.dto';
import { UpdateRiskLevelDto } from './dto/update-risk-level.dto';

@Injectable()
export class RiskLevelsService {
  private readonly crud: CatalogCrudService<SRiskLevel>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SRiskLevel>(
      this.prisma.sRiskLevel,
      'CodRiskLevel',
      'DesRiskLevel',
      'IdeRiskLevel',
      'nivel de riesgo',
    );
  }

  findAll(): Promise<SRiskLevel[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SRiskLevel> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateRiskLevelDto, actor: string): Promise<SRiskLevel> {
    const extra = await this.buildExtra(dto);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codRiskLevel, dto.desRiskLevel, extra, activeStateId, actor);
  }

  async update(id: string, dto: UpdateRiskLevelDto, actor: string): Promise<SRiskLevel> {
    const extra = await this.buildExtra(dto);
    return this.crud.update(id, dto.desRiskLevel, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SRiskLevel> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  /**
   * `desShort`/`desLarge`/`order`/`image` se copian tal cual cuando vienen
   * presentes. `codRiskLevelParent` es especial: '' desasocia el padre
   * (IdeRiskLevelParent = null), un código real lo resuelve a su
   * `IdeRiskLevel`, y `undefined` (no enviado) deja el campo intacto.
   */
  private async buildExtra(
    dto: CreateRiskLevelDto | UpdateRiskLevelDto,
  ): Promise<Record<string, unknown>> {
    const extra: Record<string, unknown> = {};
    if (dto.desShort !== undefined) extra.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) extra.DesLarge = dto.desLarge;
    if (dto.order !== undefined) extra.Order = dto.order;
    if (dto.image !== undefined) extra.Image = dto.image;
    if (dto.codRiskLevelParent !== undefined) {
      if (dto.codRiskLevelParent === '') {
        extra.IdeRiskLevelParent = null;
      } else {
        const parent = await this.prisma.sRiskLevel.findFirst({
          where: { CodRiskLevel: dto.codRiskLevelParent },
        });
        if (!parent) {
          throw new NotFoundException(
            `No existe nivel de riesgo padre con código "${dto.codRiskLevelParent}"`,
          );
        }
        extra.IdeRiskLevelParent = parent.IdeRiskLevel;
      }
    }
    return extra;
  }
}
