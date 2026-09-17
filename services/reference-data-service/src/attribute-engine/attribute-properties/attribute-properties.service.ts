import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SAttributeProperty } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateAttributePropertyDto } from './dto/create-attribute-property.dto';
import { UpdateAttributePropertyDto } from './dto/update-attribute-property.dto';

const INCLUDE = { SModelAttribute: true, SAttribute: true } as const;

/**
 * `SAttributeProperty` -- el campo de formulario REAL de un producto
 * puntual (confirmado contra datos reales, ver docs/02-roadmap.md):
 * enlaza un `SModelAttribute` (para qué producto/entidad) con un
 * `SAttribute` (qué concepto reutilizable), y trae el schema del campo
 * en `AttributeContent` (JSON como texto). `IdeAttributeProperty` (su
 * PK) es la clave que usa `RiskAttributeValue` en `TQuoteRisk`/
 * `TFileRisk` en tiempo de ejecución -- ver `PrismaAttributeValueResolver`
 * en `@ars-platform/database`, que resuelve `attribute('COD')` en el
 * motor de reglas contra exactamente esta cadena (sin cambios de código
 * ahí: ya coincide con `FGetValueAttribute` real).
 */
@Injectable()
export class AttributePropertiesService {
  private readonly crud: CatalogCrudService<SAttributeProperty>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SAttributeProperty>(
      this.prisma.sAttributeProperty,
      'CodAttributeProperty',
      'DesAttributeProperty',
      'IdeAttributeProperty',
      'campo de atributo',
      INCLUDE,
    );
  }

  findAll(): Promise<SAttributeProperty[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SAttributeProperty> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateAttributePropertyDto, actor: string): Promise<SAttributeProperty> {
    const [ideModelAttribute, ideAttribute] = await Promise.all([
      this.resolveModelAttribute(dto.codModelAttribute),
      this.resolveAttribute(dto.codAttribute),
    ]);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codAttributeProperty,
      dto.desAttributeProperty,
      {
        IdeModelAttribute: ideModelAttribute,
        IdeAttribute: ideAttribute,
        AttributeContent: dto.attributeContent,
      },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateAttributePropertyDto, actor: string): Promise<SAttributeProperty> {
    const extra: Record<string, unknown> = {};
    if (dto.codModelAttribute !== undefined) {
      extra.IdeModelAttribute = await this.resolveModelAttribute(dto.codModelAttribute);
    }
    if (dto.codAttribute !== undefined) {
      extra.IdeAttribute = await this.resolveAttribute(dto.codAttribute);
    }
    if (dto.attributeContent !== undefined) {
      extra.AttributeContent = dto.attributeContent;
    }
    return this.crud.update(id, dto.desAttributeProperty, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SAttributeProperty> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveModelAttribute(codModelAttribute: string): Promise<string> {
    const row = await this.prisma.sModelAttribute.findFirst({
      where: { CodModelAttribute: codModelAttribute },
    });
    if (!row) {
      throw new NotFoundException(`No existe set de atributos de modelo con código "${codModelAttribute}"`);
    }
    return row.IdeModelAttribute;
  }

  private async resolveAttribute(codAttribute: string): Promise<string> {
    const row = await this.prisma.sAttribute.findFirst({ where: { CodAttribute: codAttribute } });
    if (!row) {
      throw new NotFoundException(`No existe atributo con código "${codAttribute}"`);
    }
    return row.IdeAttribute;
  }
}
