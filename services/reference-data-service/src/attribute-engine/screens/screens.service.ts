import { Injectable } from '@nestjs/common';
import { PrismaService, SScreen } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateScreenDto } from './dto/create-screen.dto';
import { UpdateScreenDto } from './dto/update-screen.dto';

/**
 * `SScreen` -- la pantalla real del wizard de cotización, con su
 * contenido en `ScreenContent` (JSON real). Ver `FPInstanceFlow` en
 * docs/01-especificacion-motor-negocio-actual.md §5: en tiempo de
 * ejecución sustituye `#` en este contenido por el `DesShort` real del
 * producto/riesgo al armar el flujo de una sesión concreta -- ese
 * templating queda fuera de este módulo (es configuración, no
 * ejecución). Prerrequisito de `../flow-steps/`.
 */
@Injectable()
export class ScreensService {
  private readonly crud: CatalogCrudService<SScreen>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SScreen>(
      this.prisma.sScreen,
      'CodScreen',
      'DesScreen',
      'IdeScreen',
      'pantalla',
    );
  }

  findAll(): Promise<SScreen[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SScreen> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateScreenDto, actor: string): Promise<SScreen> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codScreen,
      dto.desScreen,
      { ScreenContent: dto.screenContent ?? {} },
      activeStateId,
      actor,
    );
  }

  update(id: string, dto: UpdateScreenDto, actor: string): Promise<SScreen> {
    const extra: Record<string, unknown> = {};
    if (dto.screenContent !== undefined) {
      extra.ScreenContent = dto.screenContent;
    }
    return this.crud.update(id, dto.desScreen, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SScreen> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
