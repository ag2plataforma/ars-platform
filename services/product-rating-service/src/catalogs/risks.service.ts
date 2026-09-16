import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SRisk } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from './catalog-crud.service';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';

@Injectable()
export class RisksService {
  private readonly crud: CatalogCrudService<SRisk>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SRisk>(
      this.prisma.sRisk,
      'CodRisk',
      'DesRisk',
      'IdeRisk',
      'riesgo',
    );
  }

  findAll(): Promise<SRisk[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SRisk> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateRiskDto, actor: string): Promise<SRisk> {
    const ideRiskLevel = await this.resolveRiskLevel(dto.codRiskLevel);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codRisk,
      dto.desRisk,
      { IdeRiskLevel: ideRiskLevel },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateRiskDto, actor: string): Promise<SRisk> {
    const extra: Record<string, unknown> = {};
    if (dto.codRiskLevel !== undefined) {
      extra.IdeRiskLevel = await this.resolveRiskLevel(dto.codRiskLevel);
    }
    return this.crud.update(id, dto.desRisk, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SRisk> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveRiskLevel(codRiskLevel: string): Promise<string> {
    const riskLevel = await this.prisma.sRiskLevel.findFirst({
      where: { CodRiskLevel: codRiskLevel },
    });
    if (!riskLevel) {
      throw new NotFoundException(`No existe nivel de riesgo con código "${codRiskLevel}"`);
    }
    return riskLevel.IdeRiskLevel;
  }
}
