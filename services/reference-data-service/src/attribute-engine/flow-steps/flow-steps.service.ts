import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SFlowStep } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateFlowStepDto } from './dto/create-flow-step.dto';
import { UpdateFlowStepDto } from './dto/update-flow-step.dto';

const INCLUDE = {
  SProcessFlow: true,
  SScreen: true,
  SStep_SFlowStep_IdeStepCurrentToSStep: true,
  SStep_SFlowStep_IdeStepForwardToSStep: true,
  SState: true,
} as const;

/**
 * `SFlowStep` -- un paso del flujo configurable de cotización, bifurcado
 * por resultado (`IndResultOK`). A diferencia del resto de este módulo,
 * NO tiene código propio (`Cod...`) -- es una tabla de configuración
 * pura identificada por su combinación
 * (`IdeProcessFlow`,`IdeStepCurrent`,`IndResultOK`,`IdeStepForward`), así
 * que no usa `CatalogCrudService` (ver el comentario de esa clase sobre
 * las tablas de unión/configuración sin código propio) y se escribe a
 * mano.
 *
 * OJO -- esto es la CONFIGURACIÓN del flujo (qué pasos existen y en qué
 * orden), no su EJECUCIÓN: reconstruir el recorrido real de una sesión
 * de cotización puntual (`FPInstanceFlow`, `FGetNextFlowStep`,
 * `TFlowStepInstance`) queda fuera de este módulo, pendiente de que
 * `underwriting-service` tenga el flujo real de cotización -- ver
 * docs/02-roadmap.md.
 */
@Injectable()
export class FlowStepsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(codProcessFlow?: string): Promise<SFlowStep[]> {
    return this.prisma.sFlowStep.findMany({
      where: codProcessFlow ? { SProcessFlow: { CodProcessFlow: codProcessFlow } } : undefined,
      include: INCLUDE,
    });
  }

  async findOne(id: string): Promise<SFlowStep> {
    const row = await this.prisma.sFlowStep.findUnique({
      where: { IdeFlowStep: id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`No existe paso de flujo con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateFlowStepDto, actor: string): Promise<SFlowStep> {
    const [ideProcessFlow, ideStepCurrent, ideStepForward, ideScreen] = await Promise.all([
      this.resolveProcessFlow(dto.codProcessFlow),
      this.resolveStep(dto.codStepCurrent),
      this.resolveStep(dto.codStepForward),
      this.resolveScreen(dto.codScreen),
    ]);

    const existing = await this.prisma.sFlowStep.findFirst({
      where: {
        IdeProcessFlow: ideProcessFlow,
        IdeStepCurrent: ideStepCurrent,
        IndResultOK: dto.indResultOK,
        IdeStepForward: ideStepForward,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Ya existe un paso de flujo con esa combinación de flujo/paso actual/resultado/paso siguiente',
      );
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sFlowStep.create({
      data: {
        IdeProcessFlow: ideProcessFlow,
        IndInitialStep: dto.indInitialStep,
        IdeStepCurrent: ideStepCurrent,
        IndResultOK: dto.indResultOK,
        IdeStepForward: ideStepForward,
        IdeScreen: ideScreen,
        FlowStepContent: dto.flowStepContent,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateFlowStepDto, actor: string): Promise<SFlowStep> {
    await this.findOne(id);
    const data: Record<string, unknown> = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.indInitialStep !== undefined) data.IndInitialStep = dto.indInitialStep;
    if (dto.codStepForward !== undefined) data.IdeStepForward = await this.resolveStep(dto.codStepForward);
    if (dto.codScreen !== undefined) data.IdeScreen = await this.resolveScreen(dto.codScreen);
    if (dto.flowStepContent !== undefined) data.FlowStepContent = dto.flowStepContent;

    return this.prisma.sFlowStep.update({ where: { IdeFlowStep: id }, data, include: INCLUDE });
  }

  async setState(id: string, codState: string, actor: string): Promise<SFlowStep> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sFlowStep.update({
      where: { IdeFlowStep: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveProcessFlow(codProcessFlow: string): Promise<string> {
    const row = await this.prisma.sProcessFlow.findFirst({ where: { CodProcessFlow: codProcessFlow } });
    if (!row) throw new NotFoundException(`No existe flujo de proceso con código "${codProcessFlow}"`);
    return row.IdeProcessFlow;
  }

  private async resolveStep(codStep: string): Promise<string> {
    const row = await this.prisma.sStep.findFirst({ where: { CodStep: codStep } });
    if (!row) throw new NotFoundException(`No existe paso con código "${codStep}"`);
    return row.IdeStep;
  }

  private async resolveScreen(codScreen: string): Promise<string> {
    const row = await this.prisma.sScreen.findFirst({ where: { CodScreen: codScreen } });
    if (!row) throw new NotFoundException(`No existe pantalla con código "${codScreen}"`);
    return row.IdeScreen;
  }
}
