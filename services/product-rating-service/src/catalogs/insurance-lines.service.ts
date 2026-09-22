import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SInsuranceLine } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateInsuranceLineDto } from './dto/create-insurance-line.dto';
import { UpdateInsuranceLineDto } from './dto/update-insurance-line.dto';

const INCLUDE = { SInsuranceArea: true, SState: true } as const;

@Injectable()
export class InsuranceLinesService {
  private readonly crud: CatalogCrudService<SInsuranceLine>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SInsuranceLine>(
      this.prisma.sInsuranceLine,
      'CodInsuranceLine',
      'DesInsuranceLine',
      'IdeInsuranceLine',
      'línea de seguro',
      INCLUDE,
    );
  }

  findAll(): Promise<SInsuranceLine[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SInsuranceLine> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateInsuranceLineDto, actor: string): Promise<SInsuranceLine> {
    const ideInsuranceArea = await this.resolveInsuranceArea(dto.codInsuranceArea);
    const extra: Record<string, unknown> = { IdeInsuranceArea: ideInsuranceArea };
    if (dto.desShort !== undefined) extra.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) extra.DesLarge = dto.desLarge;
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codInsuranceLine,
      dto.desInsuranceLine,
      extra,
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateInsuranceLineDto, actor: string): Promise<SInsuranceLine> {
    const extra: Record<string, unknown> = {};
    if (dto.codInsuranceArea !== undefined) {
      extra.IdeInsuranceArea = await this.resolveInsuranceArea(dto.codInsuranceArea);
    }
    if (dto.desShort !== undefined) extra.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) extra.DesLarge = dto.desLarge;
    return this.crud.update(id, dto.desInsuranceLine, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SInsuranceLine> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveInsuranceArea(codInsuranceArea: string): Promise<string> {
    const area = await this.prisma.sInsuranceArea.findFirst({
      where: { CodInsuranceArea: codInsuranceArea },
    });
    if (!area) {
      throw new NotFoundException(`No existe ramo de seguro con código "${codInsuranceArea}"`);
    }
    return area.IdeInsuranceArea;
  }
}
