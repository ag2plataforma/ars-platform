import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SRateFactor } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateRateFactorDto } from './dto/create-rate-factor.dto';
import { UpdateRateFactorDto } from './dto/update-rate-factor.dto';
import { ListRateFactorsDto } from './dto/list-rate-factors.dto';

const INCLUDE = { SRateTable: true, SFieldDictionary: true } as const;

/**
 * `SRateFactor` — define qué representa cada columna `Factor1`..`Factor5`
 * de `SRateValue` dentro de una `SRateTable` concreta (ej. Factor1 =
 * "EDAD", Factor2 = "ZONA"). Sin `Cod`/`Des` propio — bespoke, igual que
 * `SRiskProduct`/`SPlanProductRisk`.
 *
 * `NumOrder` no tiene `@@unique` en el esquema, pero solo hay 5 columnas
 * Factor1..5 posibles por tabla — permitir dos factores con el mismo
 * `NumOrder` en la misma tabla no tiene sentido de negocio, se valida acá.
 */
@Injectable()
export class RateFactorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(query: ListRateFactorsDto): Promise<SRateFactor[]> {
    const where: Prisma.SRateFactorWhereInput = {};
    if (query.codRateTable) {
      where.SRateTable = { CodRateTable: query.codRateTable };
    }
    return this.prisma.sRateFactor.findMany({
      where,
      orderBy: { NumOrder: 'asc' },
      include: INCLUDE,
    });
  }

  async findOne(id: string): Promise<SRateFactor> {
    const row = await this.prisma.sRateFactor.findUnique({
      where: { IdeRateFactor: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe factor de tarifa con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateRateFactorDto, actor: string): Promise<SRateFactor> {
    const ideRateTable = await this.resolveRateTable(dto.codRateTable);

    const existing = await this.prisma.sRateFactor.findFirst({
      where: { IdeRateTable: ideRateTable, NumOrder: dto.numOrder },
    });
    if (existing) {
      throw new ConflictException(
        `La tabla "${dto.codRateTable}" ya tiene un factor en la posición ${dto.numOrder}`,
      );
    }

    const ideFieldDictionary = dto.codFieldDictionary
      ? await this.resolveFieldDictionary(dto.codFieldDictionary)
      : undefined;

    // SRateFactor no tiene un flujo propio de "activar/desactivar" (no
    // expone /state), pero IdeState es NOT NULL en el esquema — se fija
    // al estado "Activo", igual que el resto de las tablas de configuración.
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();

    return this.prisma.sRateFactor.create({
      data: {
        IdeRateTable: ideRateTable,
        IdeFieldDictionary: ideFieldDictionary,
        NumOrder: dto.numOrder,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateRateFactorDto, actor: string): Promise<SRateFactor> {
    const current = await this.findOne(id);

    const data: Prisma.SRateFactorUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.numOrder !== undefined) {
      const existing = await this.prisma.sRateFactor.findFirst({
        where: { IdeRateTable: current.IdeRateTable, NumOrder: dto.numOrder, NOT: { IdeRateFactor: id } },
      });
      if (existing) {
        throw new ConflictException(
          `Esta tabla ya tiene un factor en la posición ${dto.numOrder}`,
        );
      }
      data.NumOrder = dto.numOrder;
    }
    if (dto.codFieldDictionary !== undefined) {
      data.IdeFieldDictionary = await this.resolveFieldDictionary(dto.codFieldDictionary);
    }

    return this.prisma.sRateFactor.update({ where: { IdeRateFactor: id }, data, include: INCLUDE });
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

  private async resolveFieldDictionary(codFieldDictionary: string): Promise<string> {
    const field = await this.prisma.sFieldDictionary.findFirst({
      where: { CodFieldDictionary: codFieldDictionary },
    });
    if (!field) {
      throw new NotFoundException(`No existe campo con código "${codFieldDictionary}"`);
    }
    return field.IdeFieldDictionary;
  }
}
