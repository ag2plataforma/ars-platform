import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SCommission } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { ListCommissionsDto } from './dto/list-commissions.dto';

const INCLUDE = { SCommissionTable: true, SProcess: true } as const;

/**
 * `SCommission` -- el % de comisión vigente de una `SCommissionTable`
 * para un `SProcess` concreto, en una ventana `[TstInitial, TstEnd]`.
 * Sin `Cod`/`Des` propio (tabla de configuración pura, misma forma que
 * `SRateValue`) así que se escribe a mano, mismo estilo que
 * `rate-values.service.ts` en `product-rating-service`, en vez de usar
 * `CatalogCrudService`.
 *
 * `NumMovement` -- confirmado contra el `FReceipt` real
 * (`resolveCommissionPercentage`/`generateReceipts` en
 * `underwriting-service` ya leen esta columna con
 * `orderBy: { NumMovement: 'desc' }`, exactamente el
 * `select max(NumMovement)` del original): es un correlativo de
 * versión por `(IdeCommissionTable, IdeProcess)`, NO un dato que cargue
 * el usuario -- acá se calcula automáticamente como el máximo existente
 * + 1, mismo criterio que `NumOperation` en `createContractOperation`.
 * No existe función PL/pgSQL propia que reversear para esta tabla, así
 * que no hay un comportamiento real de "reemplazo" que replicar al
 * crear una nueva versión -- las filas anteriores quedan tal cual,
 * simplemente dejan de ser la de mayor `NumMovement`.
 *
 * `codCommissionTable`/`codProcess` NO se pueden cambiar en un
 * `update()` a propósito (afectarían la clave de versión) -- para
 * moverla a otra tabla/proceso, se crea una fila nueva.
 */
@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(query: ListCommissionsDto): Promise<SCommission[]> {
    const where: Prisma.SCommissionWhereInput = {};
    if (query.codCommissionTable) {
      where.SCommissionTable = { CodCommissionTable: query.codCommissionTable };
    }
    return this.prisma.sCommission.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ IdeCommissionTable: 'asc' }, { NumMovement: 'desc' }],
    });
  }

  async findOne(id: string): Promise<SCommission> {
    const row = await this.prisma.sCommission.findUnique({ where: { IdeCommission: id }, include: INCLUDE });
    if (!row) {
      throw new NotFoundException(`No existe comisión con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateCommissionDto, actor: string): Promise<SCommission> {
    const ideCommissionTable = await this.resolveCommissionTable(dto.codCommissionTable);
    const ideProcess = await this.resolveProcess(dto.codProcess);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');

    const lastCommission = await this.prisma.sCommission.findFirst({
      where: { IdeCommissionTable: ideCommissionTable, IdeProcess: ideProcess },
      orderBy: { NumMovement: 'desc' },
      select: { NumMovement: true },
    });
    const numMovement = (lastCommission?.NumMovement ?? 0) + 1;

    const now = new Date();
    return this.prisma.sCommission.create({
      data: {
        IdeCommissionTable: ideCommissionTable,
        IdeProcess: ideProcess,
        Percentaje: dto.percentaje,
        TstInitial: new Date(dto.tstInitial),
        TstEnd: new Date(dto.tstEnd),
        NumMovement: numMovement,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateCommissionDto, actor: string): Promise<SCommission> {
    await this.findOne(id);
    const data: Prisma.SCommissionUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.percentaje !== undefined) data.Percentaje = dto.percentaje;
    if (dto.tstInitial !== undefined) data.TstInitial = new Date(dto.tstInitial);
    if (dto.tstEnd !== undefined) data.TstEnd = new Date(dto.tstEnd);

    return this.prisma.sCommission.update({ where: { IdeCommission: id }, data, include: INCLUDE });
  }

  async setState(id: string, codState: string, actor: string): Promise<SCommission> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sCommission.update({
      where: { IdeCommission: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveCommissionTable(codCommissionTable: string): Promise<string> {
    const table = await this.prisma.sCommissionTable.findFirst({ where: { CodCommissionTable: codCommissionTable } });
    if (!table) {
      throw new NotFoundException(`No existe tabla de comisión con código "${codCommissionTable}"`);
    }
    return table.IdeCommissionTable;
  }

  private async resolveProcess(codProcess: string): Promise<string> {
    const process = await this.prisma.sProcess.findFirst({ where: { CodProcess: codProcess } });
    if (!process) {
      throw new NotFoundException(`No existe proceso con código "${codProcess}"`);
    }
    return process.IdeProcess;
  }
}
