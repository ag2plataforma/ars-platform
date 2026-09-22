import { Injectable } from '@nestjs/common';
import { PrismaService, SConceptType } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateConceptTypeDto } from './dto/create-concept-type.dto';
import { UpdateConceptTypeDto } from './dto/update-concept-type.dto';

const INCLUDE = { SState: true } as const;

@Injectable()
export class ConceptTypesService {
  private readonly crud: CatalogCrudService<SConceptType>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SConceptType>(
      prisma.sConceptType,
      'CodConceptType',
      'DesConceptType',
      'IdeConceptType',
      'tipo de concepto',
      INCLUDE,
    );
  }

  findAll(): Promise<SConceptType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SConceptType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateConceptTypeDto, actor: string): Promise<SConceptType> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codConceptType, dto.desConceptType, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateConceptTypeDto, actor: string): Promise<SConceptType> {
    return this.crud.update(id, dto.desConceptType, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SConceptType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
