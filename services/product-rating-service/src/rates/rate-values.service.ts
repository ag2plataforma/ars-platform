import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaRateValueResolver, PrismaService, SRateValue } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateRateValueDto } from './dto/create-rate-value.dto';
import { UpdateRateValueDto } from './dto/update-rate-value.dto';
import { ListRateValuesDto } from './dto/list-rate-values.dto';
import { GetRateValueDto } from './dto/get-rate-value.dto';

const INCLUDE = { SRateTable: true, SState: true } as const;

/**
 * `SRateValue` — una fila de una tabla de tarifa: valores concretos para
 * hasta 5 factores más el valor resultante y su vigencia. Incluye el CRUD
 * de configuración y `getRateValue`, el equivalente exacto a la función
 * legacy `FGetRateValue` (ver ese método para el detalle de su semántica,
 * confirmada contra el código fuente original en Postgres).
 */
@Injectable()
export class RateValuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly rateValueResolver: PrismaRateValueResolver,
  ) {}

  findAll(query: ListRateValuesDto): Promise<SRateValue[]> {
    const where: Prisma.SRateValueWhereInput = {};
    if (query.codRateTable) {
      where.SRateTable = { CodRateTable: query.codRateTable };
    }
    return this.prisma.sRateValue.findMany({ where, include: INCLUDE });
  }

  async findOne(id: string): Promise<SRateValue> {
    const row = await this.prisma.sRateValue.findUnique({
      where: { IdeRateValue: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe valor de tarifa con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateRateValueDto, actor: string): Promise<SRateValue> {
    const ideRateTable = dto.codRateTable ? await this.resolveRateTable(dto.codRateTable) : undefined;
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();

    return this.prisma.sRateValue.create({
      data: {
        IdeRateTable: ideRateTable,
        TstInit: new Date(dto.tstInit),
        TstEnd: new Date(dto.tstEnd),
        Factor1: dto.factor1,
        Factor2: dto.factor2,
        Factor3: dto.factor3,
        Factor4: dto.factor4,
        Factor5: dto.factor5,
        Value: dto.value,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateRateValueDto, actor: string): Promise<SRateValue> {
    await this.findOne(id);

    const data: Prisma.SRateValueUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.codRateTable !== undefined) data.IdeRateTable = await this.resolveRateTable(dto.codRateTable);
    if (dto.tstInit !== undefined) data.TstInit = new Date(dto.tstInit);
    if (dto.tstEnd !== undefined) data.TstEnd = new Date(dto.tstEnd);
    if (dto.factor1 !== undefined) data.Factor1 = dto.factor1;
    if (dto.factor2 !== undefined) data.Factor2 = dto.factor2;
    if (dto.factor3 !== undefined) data.Factor3 = dto.factor3;
    if (dto.factor4 !== undefined) data.Factor4 = dto.factor4;
    if (dto.factor5 !== undefined) data.Factor5 = dto.factor5;
    if (dto.value !== undefined) data.Value = dto.value;

    return this.prisma.sRateValue.update({ where: { IdeRateValue: id }, data, include: INCLUDE });
  }

  async setState(id: string, codState: string, actor: string): Promise<SRateValue> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sRateValue.update({
      where: { IdeRateValue: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  /**
   * Equivalente exacto a la función legacy `FGetRateValue` — delega en
   * `PrismaRateValueResolver` (`@ars-platform/database`), la MISMA
   * implementación que usa el motor de reglas cuando una fórmula de
   * `SCalculationRule` invoca `FGetRateValue(...)` (ver `RulesEngineService`
   * en `@ars-platform/shared-common`), para no mantener la lógica de
   * búsqueda duplicada. Ver ese archivo para el detalle completo de la
   * semántica exacta (confirmada contra el código fuente original en
   * Postgres, incluyendo que NO filtra por vigencia `TstInit`/`TstEnd`
   * pese a que la tabla las tiene).
   */
  getRateValue(dto: GetRateValueDto): Promise<number> {
    return this.rateValueResolver.resolveRateValue(
      dto.codRateTable,
      dto.factor1,
      dto.factor2,
      dto.factor3,
      dto.factor4,
      dto.factor5,
    );
  }

  private async resolveRateTable(codRateTable: string): Promise<string> {
    const rateTable = await this.prisma.sRateTable.findFirst({
      where: { CodRateTable: codRateTable },
    });
    if (!rateTable) {
      throw new NotFoundException(`No existe tabla de tarifa con código "${codRateTable}"`);
    }
    return rateTable.IdeRateTable;
  }
}
