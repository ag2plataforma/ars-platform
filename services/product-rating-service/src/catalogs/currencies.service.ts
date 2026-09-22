import { Injectable } from '@nestjs/common';
import { PrismaService, SCurrency } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@Injectable()
export class CurrenciesService {
  private readonly crud: CatalogCrudService<SCurrency>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SCurrency>(
      prisma.sCurrency,
      'CodCurrency',
      'DesCurrency',
      'IdeCurrency',
      'moneda',
      { SState: true },
    );
  }

  findAll(): Promise<SCurrency[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SCurrency> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateCurrencyDto, actor: string): Promise<SCurrency> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codCurrency,
      dto.desCurrency,
      { SymbolCurrency: dto.symbolCurrency },
      activeStateId,
      actor,
    );
  }

  update(id: string, dto: UpdateCurrencyDto, actor: string): Promise<SCurrency> {
    const extra: Record<string, unknown> = {};
    if (dto.symbolCurrency !== undefined) extra.SymbolCurrency = dto.symbolCurrency;
    return this.crud.update(id, dto.desCurrency, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SCurrency> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
