import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SInsuranceArea } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateInsuranceAreaDto } from './dto/create-insurance-area.dto';
import { UpdateInsuranceAreaDto } from './dto/update-insurance-area.dto';

@Injectable()
export class InsuranceAreasService {
  private readonly crud: CatalogCrudService<SInsuranceArea>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SInsuranceArea>(
      this.prisma.sInsuranceArea,
      'CodInsuranceArea',
      'DesInsuranceArea',
      'IdeInsuranceArea',
      'ramo de seguro',
    );
  }

  findAll(): Promise<SInsuranceArea[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SInsuranceArea> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateInsuranceAreaDto, actor: string): Promise<SInsuranceArea> {
    const extra = await this.buildExtra(dto);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codInsuranceArea,
      dto.desInsuranceArea,
      extra,
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateInsuranceAreaDto, actor: string): Promise<SInsuranceArea> {
    const extra = await this.buildExtra(dto);
    return this.crud.update(id, dto.desInsuranceArea, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SInsuranceArea> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  /** Mismo criterio que RiskLevelsService.buildExtra para el padre jerárquico. */
  private async buildExtra(
    dto: CreateInsuranceAreaDto | UpdateInsuranceAreaDto,
  ): Promise<Record<string, unknown>> {
    const extra: Record<string, unknown> = {};
    if (dto.desShort !== undefined) extra.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) extra.DesLarge = dto.desLarge;
    if (dto.codInsuranceAreaParent !== undefined) {
      if (dto.codInsuranceAreaParent === '') {
        extra.IdeInsuranceAreaParent = null;
      } else {
        const parent = await this.prisma.sInsuranceArea.findFirst({
          where: { CodInsuranceArea: dto.codInsuranceAreaParent },
        });
        if (!parent) {
          throw new NotFoundException(
            `No existe ramo de seguro padre con código "${dto.codInsuranceAreaParent}"`,
          );
        }
        extra.IdeInsuranceAreaParent = parent.IdeInsuranceArea;
      }
    }
    return extra;
  }
}
