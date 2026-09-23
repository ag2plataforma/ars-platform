import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SCommissionTree } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateCommissionTreeDto } from './dto/create-commission-tree.dto';
import { UpdateCommissionTreeDto } from './dto/update-commission-tree.dto';

const INCLUDE = { SCommissionTable: true, SState: true } as const;

/**
 * `SCommissionTree` -- el árbol de comisión de UN canal de distribución
 * (`IdeDistributionChannel`). Sin función PL/pgSQL propia de escritura
 * (confirmado, ver `brokers.service.ts`); `Cod`/`Des` únicos, reutiliza
 * `CatalogCrudService`. `resolveCommissionPercentage` en
 * `underwriting-service` ya lee esta tabla (junto con
 * `SCommissionTable`/`SCommission`) para calcular la comisión real de
 * un recibo -- este CRUD es lo que faltaba para darlas de alta sin
 * tocar la BD a mano.
 */
@Injectable()
export class CommissionTreesService {
  private readonly crud: CatalogCrudService<SCommissionTree>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SCommissionTree>(
      prisma.sCommissionTree,
      'CodCommissionTree',
      'DesCommissionTree',
      'IdeCommissionTree',
      'árbol de comisión',
      INCLUDE,
    );
  }

  findAll(): Promise<SCommissionTree[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SCommissionTree> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateCommissionTreeDto, actor: string): Promise<SCommissionTree> {
    const ideDistributionChannel = await this.resolveDistributionChannel(dto.codDistributionChannel);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codCommissionTree,
      dto.desCommissionTree,
      { IdeDistributionChannel: ideDistributionChannel },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateCommissionTreeDto, actor: string): Promise<SCommissionTree> {
    const extra: Record<string, unknown> = {};
    if (dto.codDistributionChannel !== undefined) {
      extra.IdeDistributionChannel = await this.resolveDistributionChannel(dto.codDistributionChannel);
    }
    return this.crud.update(id, dto.desCommissionTree, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SCommissionTree> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveDistributionChannel(codDistributionChannel: string): Promise<string> {
    const channel = await this.prisma.sDistributionChannel.findFirst({
      where: { CodDistributionChannel: codDistributionChannel },
    });
    if (!channel) {
      throw new NotFoundException(`No existe canal de distribución con código "${codDistributionChannel}"`);
    }
    return channel.IdeDistributionChannel;
  }
}
