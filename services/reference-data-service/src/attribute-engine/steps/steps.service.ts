import { Injectable } from '@nestjs/common';
import { PrismaService, SStep } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';

/** Forma que ya devuelven el resto de catálogos de este módulo (`SScreen`,
 *  `SProcessFlow`, `SFlowStep`, todos con relación real hacia `SState`) --
 *  ver el comentario de `attachState` sobre por qué acá hay que armarla a
 *  mano en vez de pedirla con `include`. */
type SStepWithState = SStep & { SState: { CodState: string; DesState: string } | null };

/**
 * `SStep` -- catálogo simple: un paso posible dentro de cualquier flujo
 * (ej. "datos-personales", "cotizacion"). `SFlowStep` lo referencia dos
 * veces (paso actual / paso siguiente) -- ver `../flow-steps/`.
 *
 * Defecto real confirmado en la BD (2026-09-24, al exponer por primera
 * vez esta pantalla): a diferencia de sus 3 hermanas del mismo motor
 * (`SScreen`/`SProcessFlow`/`SFlowStep`, las 3 con `FK_..._SState` real),
 * `SStep` tiene el índice `IX_SStep_SState` pero NUNCA tuvo el
 * constraint de foreign key hacia `SState` -- por eso Prisma no generó
 * ninguna relación para ese lado en `schema.prisma` (solo el campo
 * escalar `IdeState`), y pedirle `include: { SState: true }` explota
 * con un error 500 (`Unknown field 'SState'`). En vez de agregar la FK
 * que falta en la BD real (fuera de alcance de esta pantalla), se
 * resuelve el estado a mano -- mismo criterio ya usado en
 * `commission-trees-tab.component.ts` (frontend) para una columna sin
 * FK real, acá aplicado en el backend para que el shape de la respuesta
 * (`row.SState.CodState`) sea idéntico al de cualquier otro catálogo.
 */
@Injectable()
export class StepsService {
  private readonly crud: CatalogCrudService<SStep>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SStep>(
      this.prisma.sStep,
      'CodStep',
      'DesStep',
      'IdeStep',
      'paso',
    );
  }

  async findAll(): Promise<SStepWithState[]> {
    return this.attachState(await this.crud.findAll());
  }

  async findOne(id: string): Promise<SStepWithState> {
    return (await this.attachState([await this.crud.findOne(id)]))[0];
  }

  async create(dto: CreateStepDto, actor: string): Promise<SStepWithState> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const row = await this.crud.create(dto.codStep, dto.desStep, {}, activeStateId, actor);
    return (await this.attachState([row]))[0];
  }

  async update(id: string, dto: UpdateStepDto, actor: string): Promise<SStepWithState> {
    const row = await this.crud.update(id, dto.desStep, {}, actor);
    return (await this.attachState([row]))[0];
  }

  async setState(id: string, codState: string, actor: string): Promise<SStepWithState> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    const row = await this.crud.setState(id, stateId, actor);
    return (await this.attachState([row]))[0];
  }

  /** Resuelve `IdeState` -> `{ CodState, DesState }` a mano (ver el
   *  comentario de la clase) con una sola consulta extra por lote, sin
   *  importar cuántas filas se pidan. */
  private async attachState(rows: SStep[]): Promise<SStepWithState[]> {
    const ids = [...new Set(rows.map((row) => row.IdeState))];
    const states = ids.length > 0 ? await this.prisma.sState.findMany({ where: { IdeState: { in: ids } } }) : [];
    const byId = new Map(states.map((state) => [state.IdeState, { CodState: state.CodState, DesState: state.DesState }]));
    return rows.map((row) => ({ ...row, SState: byId.get(row.IdeState) ?? null }));
  }
}
