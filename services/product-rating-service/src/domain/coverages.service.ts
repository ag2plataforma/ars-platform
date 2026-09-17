import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SCoverage } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateCoverageDto } from './dto/create-coverage.dto';
import { UpdateCoverageDto } from './dto/update-coverage.dto';

@Injectable()
export class CoveragesService {
  private readonly crud: CatalogCrudService<SCoverage>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SCoverage>(
      this.prisma.sCoverage,
      'CodCoverage',
      'DesCoverage',
      'IdeCoverage',
      'cobertura',
      { SInsuranceLine: true, SState: true },
    );
  }

  findAll(): Promise<SCoverage[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SCoverage> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateCoverageDto, actor: string): Promise<SCoverage> {
    const ideInsuranceLine = await this.resolveInsuranceLine(dto.codInsuranceLine);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codCoverage,
      dto.desCoverage,
      { IdeInsuranceLine: ideInsuranceLine },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateCoverageDto, actor: string): Promise<SCoverage> {
    const extra: Record<string, unknown> = {};
    if (dto.codInsuranceLine !== undefined) {
      extra.IdeInsuranceLine = await this.resolveInsuranceLine(dto.codInsuranceLine);
    }
    return this.crud.update(id, dto.desCoverage, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SCoverage> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveInsuranceLine(codInsuranceLine: string): Promise<string> {
    const line = await this.prisma.sInsuranceLine.findFirst({
      where: { CodInsuranceLine: codInsuranceLine },
    });
    if (!line) {
      throw new NotFoundException(`No existe línea de seguro con código "${codInsuranceLine}"`);
    }
    return line.IdeInsuranceLine;
  }
}
