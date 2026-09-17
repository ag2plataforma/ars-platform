import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SAttribute } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';

/**
 * `SAttribute` -- concepto de atributo reutilizable (ej. "Raza del
 * Perro", "Fecha de Compra" en los datos reales investigados), ligado a
 * un `SFieldDictionary`. NO es el campo de formulario real de un
 * producto puntual -- eso es `SAttributeProperty`
 * (ver `../attribute-properties/`), que referencia a este. Ver
 * docs/02-roadmap.md para la cadena completa confirmada contra datos
 * reales (`SModelAttribute` -> `SAttributeProperty` -> `SAttribute` ->
 * `SFieldValue`).
 */
@Injectable()
export class AttributesService {
  private readonly crud: CatalogCrudService<SAttribute>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SAttribute>(
      this.prisma.sAttribute,
      'CodAttribute',
      'DesAttribute',
      'IdeAttribute',
      'atributo',
    );
  }

  findAll(): Promise<SAttribute[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SAttribute> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateAttributeDto, actor: string): Promise<SAttribute> {
    const ideFieldDictionary = await this.resolveFieldDictionary(dto.codFieldDictionary);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codAttribute,
      dto.desAttribute,
      { IdeFieldDictionary: ideFieldDictionary, AttributeContent: dto.attributeContent ?? '{}' },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateAttributeDto, actor: string): Promise<SAttribute> {
    const extra: Record<string, unknown> = {};
    if (dto.codFieldDictionary !== undefined) {
      extra.IdeFieldDictionary = await this.resolveFieldDictionary(dto.codFieldDictionary);
    }
    if (dto.attributeContent !== undefined) {
      extra.AttributeContent = dto.attributeContent;
    }
    return this.crud.update(id, dto.desAttribute, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SAttribute> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveFieldDictionary(codFieldDictionary: string): Promise<string> {
    const field = await this.prisma.sFieldDictionary.findFirst({
      where: { CodFieldDictionary: codFieldDictionary },
    });
    if (!field) {
      throw new NotFoundException(
        `No existe campo del diccionario con código "${codFieldDictionary}"`,
      );
    }
    return field.IdeFieldDictionary;
  }
}
