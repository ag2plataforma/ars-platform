import { Injectable } from '@nestjs/common';
import { PrismaService, SValidityType } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateValidityTypeDto } from './dto/create-validity-type.dto';
import { UpdateValidityTypeDto } from './dto/update-validity-type.dto';

/**
 * `SValidityType` -- catálogo de tipos de vigencia de una póliza (Anual, temporal...).
 * Qué tipo usa cada producto se configura aparte en `SProductValidityType`
 * (`ProductValidityTypesService`); sin esa fila el producto no se puede contratar.
 */
@Injectable()
export class ValidityTypesService {
  private readonly crud: CatalogCrudService<SValidityType>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SValidityType>(
      prisma.sValidityType,
      'CodValidityType',
      'DesValidityType',
      'IdeValidityType',
      'tipo de vigencia',
      { SState: true },
    );
  }

  findAll(): Promise<SValidityType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SValidityType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateValidityTypeDto, actor: string): Promise<SValidityType> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codValidityType, dto.desValidityType, { IndAnnual: dto.indAnnual }, activeStateId, actor);
  }

  update(id: string, dto: UpdateValidityTypeDto, actor: string): Promise<SValidityType> {
    const extra: Record<string, unknown> = {};
    if (dto.indAnnual !== undefined) extra.IndAnnual = dto.indAnnual;
    return this.crud.update(id, dto.desValidityType, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SValidityType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
