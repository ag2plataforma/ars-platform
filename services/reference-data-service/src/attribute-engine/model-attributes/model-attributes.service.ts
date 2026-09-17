import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SModelAttribute } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateModelAttributeDto } from './dto/create-model-attribute.dto';
import { UpdateModelAttributeDto } from './dto/update-model-attribute.dto';

const INCLUDE = {
  SEntity_SModelAttribute_IdeEntityApplyToSEntity: true,
  SEntity_SModelAttribute_IdeEntityReferenceToSEntity: true,
  SFlowStep: true,
} as const;

/**
 * `SModelAttribute` -- qué set de atributos personalizables aplica a qué
 * entidad/producto (ej. "Perro", "BikeMountain", "SMARTPHONE" en los 7
 * filas reales investigadas). Es el punto de entrada de la cadena
 * confirmada contra datos reales
 * `SModelAttribute` -> `SAttributeProperty` -> `SAttribute` ->
 * `SFieldValue` (ver docs/02-roadmap.md). `IdeReference` es polimórfico
 * -- ver el DTO de creación.
 */
@Injectable()
export class ModelAttributesService {
  private readonly crud: CatalogCrudService<SModelAttribute>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SModelAttribute>(
      this.prisma.sModelAttribute,
      'CodModelAttribute',
      'DesModelAttribute',
      'IdeModelAttribute',
      'set de atributos de modelo',
      INCLUDE,
    );
  }

  findAll(): Promise<SModelAttribute[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SModelAttribute> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateModelAttributeDto, actor: string): Promise<SModelAttribute> {
    const [ideEntityApply, ideEntityReference] = await Promise.all([
      this.resolveEntity(dto.codEntityApply),
      this.resolveEntity(dto.codEntityReference),
    ]);
    if (dto.ideFlowStep) {
      await this.assertFlowStepExists(dto.ideFlowStep);
    }
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codModelAttribute,
      dto.desModelAttribute,
      {
        IdeEntityApply: ideEntityApply,
        IdeEntityReference: ideEntityReference,
        IdeFlowStep: dto.ideFlowStep ?? null,
        IdeReference: dto.ideReference,
      },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateModelAttributeDto, actor: string): Promise<SModelAttribute> {
    const extra: Record<string, unknown> = {};
    if (dto.codEntityApply !== undefined) {
      extra.IdeEntityApply = await this.resolveEntity(dto.codEntityApply);
    }
    if (dto.codEntityReference !== undefined) {
      extra.IdeEntityReference = await this.resolveEntity(dto.codEntityReference);
    }
    if (dto.ideFlowStep !== undefined) {
      await this.assertFlowStepExists(dto.ideFlowStep);
      extra.IdeFlowStep = dto.ideFlowStep;
    }
    if (dto.ideReference !== undefined) {
      extra.IdeReference = dto.ideReference;
    }
    return this.crud.update(id, dto.desModelAttribute, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SModelAttribute> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveEntity(codEntity: string): Promise<string> {
    const entity = await this.prisma.sEntity.findFirst({ where: { CodEntity: codEntity } });
    if (!entity) {
      throw new NotFoundException(`No existe entidad con código "${codEntity}"`);
    }
    return entity.IdeEntity;
  }

  private async assertFlowStepExists(ideFlowStep: string): Promise<void> {
    const flowStep = await this.prisma.sFlowStep.findUnique({ where: { IdeFlowStep: ideFlowStep } });
    if (!flowStep) {
      throw new NotFoundException(`No existe paso de flujo con id "${ideFlowStep}"`);
    }
  }
}
