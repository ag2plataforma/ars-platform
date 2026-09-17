import { Injectable } from '@nestjs/common';
import { PrismaService, SRateTable } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateRateTableDto } from './dto/create-rate-table.dto';
import { UpdateRateTableDto } from './dto/update-rate-table.dto';

/**
 * `SRateTable` — el "nombre" de una tabla de tarifa multidimensional
 * (ej. "Tarifa por edad y zona"). Tiene `Cod`/`Des` único, así que
 * reutiliza `CatalogCrudService` igual que los catálogos.
 *
 * Trae sus `SRateFactor` (qué representa cada columna Factor1..5, ver
 * `rate-factors.service.ts`) ordenados por `NumOrder`, para que el
 * consumidor sepa de entrada cómo interpretar las filas de
 * `SRateValue` sin una llamada aparte.
 *
 * IMPORTANTE: esto es solo el CRUD de configuración. El equivalente a
 * `FGetRateValue` (la función que busca el valor aplicable dados los
 * factores concretos de una cotización) todavía NO está implementado —
 * `docs/01-especificacion-motor-negocio-actual.md` (§3.3) documenta el
 * comodín NULL por factor pero no el criterio de desempate cuando más
 * de una fila calza (ej. una fila más específica vs. una con comodines),
 * y adivinar ese criterio en una función que determina primas reales es
 * más riesgoso que preguntarlo. Ver `packages/database/scripts/find-legacy-function.js`.
 */
@Injectable()
export class RateTablesService {
  private readonly crud: CatalogCrudService<SRateTable>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SRateTable>(
      prisma.sRateTable,
      'CodRateTable',
      'DesRateTable',
      'IdeRateTable',
      'tabla de tarifa',
      { SRateFactor: { orderBy: { NumOrder: 'asc' }, include: { SFieldDictionary: true } } },
    );
  }

  findAll(): Promise<SRateTable[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SRateTable> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateRateTableDto, actor: string): Promise<SRateTable> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codRateTable, dto.desRateTable, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateRateTableDto, actor: string): Promise<SRateTable> {
    return this.crud.update(id, dto.desRateTable, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SRateTable> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
