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

  /**
   * Arma el schema de formulario dinámico para un `IdeReference` dado
   * (hoy siempre un `IdeRiskProduct`, ver `IdeEntityApply`/`CodEntity`
   * de la cadena real confirmada en docs/02-roadmap.md -- "Investigación
   * del motor de atributos personalizables"): junta cada
   * `SModelAttribute` activo con esa referencia, sus `SAttributeProperty`
   * activos, y por cada uno el JSON de `AttributeContent`
   * ({name,label,type,validators,validationMessages,options?}).
   *
   * Para `type` `select`/`radio`, las opciones del JSON legacy quedan
   * DESACTUALIZADAS frente al catálogo real (confirmado con datos
   * reales: "Raza de Perro" trae 13 opciones embebidas contra 66 filas
   * reales en `SFieldValue`, con codificaciones de `value` distintas
   * entre sí) -- por eso acá SIEMPRE se reemplazan por las opciones
   * activas reales de `SFieldValue` (vía `SAttribute.IdeFieldDictionary`)
   * cuando ese diccionario tiene alguna fila activa, y solo se cae al
   * array embebido del JSON si el diccionario no tiene ninguna (ej.
   * "Esterilizado", que es un booleano literal, nunca pasa por
   * `SFieldValue`). El `value` que hay que guardar en
   * `RiskAttributeValue` es siempre el `IdeFieldValue` real cuando viene
   * de acá -- así el motor de reglas (`PrismaAttributeValueResolver`) lo
   * resuelve correctamente al tarificar.
   */
  async getSchemaForReference(ideReference: string): Promise<{
    fields: Array<{
      ideAttributeProperty: string;
      codAttributeProperty: string;
      name: string;
      label: string;
      type: string;
      validators: Array<{ validationName: string; aditionalProps?: Record<string, unknown> }>;
      validationMessages: Record<string, string>;
      options?: Array<{ key: string; value: unknown }>;
    }>;
  }> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');

    const models = await this.prisma.sModelAttribute.findMany({
      where: { IdeReference: ideReference, IdeState: activeStateId },
    });
    if (models.length === 0) {
      return { fields: [] };
    }

    const properties = await this.prisma.sAttributeProperty.findMany({
      where: { IdeModelAttribute: { in: models.map((m) => m.IdeModelAttribute) }, IdeState: activeStateId },
      include: {
        SAttribute: {
          include: {
            SFieldDictionary: {
              include: { SFieldValue: { where: { IdeState: activeStateId }, orderBy: { DesFieldValue: 'asc' } } },
            },
          },
        },
      },
      orderBy: { TstCreation: 'asc' },
    });

    return {
      fields: properties.map((property) => {
        let content: Record<string, unknown> = {};
        try {
          content = JSON.parse(property.AttributeContent);
        } catch {
          // AttributeContent inválido -- se ignora y se usan los defaults de abajo
          // en vez de romper toda la pantalla por un campo mal cargado.
        }

        const liveValues = property.SAttribute.SFieldDictionary?.SFieldValue ?? [];
        const embeddedOptions = Array.isArray(content.options)
          ? (content.options as Array<{ key: string; value: unknown }>)
          : undefined;
        const options =
          liveValues.length > 0
            ? liveValues.map((v) => ({ key: v.DesFieldValue, value: v.IdeFieldValue }))
            : embeddedOptions;

        return {
          ideAttributeProperty: property.IdeAttributeProperty,
          codAttributeProperty: property.CodAttributeProperty,
          name: typeof content.name === 'string' ? content.name : property.CodAttributeProperty,
          label: typeof content.label === 'string' ? content.label : property.DesAttributeProperty,
          type: typeof content.type === 'string' ? content.type : 'text',
          validators: Array.isArray(content.validators) ? (content.validators as never[]) : [],
          validationMessages:
            content.validationMessages && typeof content.validationMessages === 'object'
              ? (content.validationMessages as Record<string, string>)
              : {},
          ...(options ? { options } : {}),
        };
      }),
    };
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
