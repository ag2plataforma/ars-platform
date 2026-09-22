import { Injectable } from '@nestjs/common';
import { PrismaService, SDeductibleType } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateDeductibleTypeDto } from './dto/create-deductible-type.dto';
import { UpdateDeductibleTypeDto } from './dto/update-deductible-type.dto';

@Injectable()
export class DeductibleTypesService {
  private readonly crud: CatalogCrudService<SDeductibleType>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SDeductibleType>(
      prisma.sDeductibleType,
      'CodDeductibleType',
      'DesDeductibleType',
      'IdeDeductibleType',
      'tipo de deducible',
      { SState: true },
    );
  }

  findAll(): Promise<SDeductibleType[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SDeductibleType> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateDeductibleTypeDto, actor: string): Promise<SDeductibleType> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codDeductibleType, dto.desDeductibleType, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateDeductibleTypeDto, actor: string): Promise<SDeductibleType> {
    return this.crud.update(id, dto.desDeductibleType, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SDeductibleType> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
