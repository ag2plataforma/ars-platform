import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SFieldValue } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateFieldValueDto } from './dto/create-field-value.dto';
import { UpdateFieldValueDto } from './dto/update-field-value.dto';

const INCLUDE = { SFieldDictionary: true } as const;

/**
 * `SFieldValue` -- catálogo de valores posibles para un `SFieldDictionary`
 * (ej. el campo ESTADO_CIVIL tiene los valores SOLTERO/CASADO/...). Mismo
 * patrón que `RisksService` en product-rating-service: FK propia
 * (`IdeFieldDictionary`) resuelta por código, no por id.
 */
@Injectable()
export class FieldValuesService {
  private readonly crud: CatalogCrudService<SFieldValue>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SFieldValue>(
      this.prisma.sFieldValue,
      'CodFieldValue',
      'DesFieldValue',
      'IdeFieldValue',
      'valor de campo',
      INCLUDE,
    );
  }

  findAll(): Promise<SFieldValue[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SFieldValue> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateFieldValueDto, actor: string): Promise<SFieldValue> {
    const ideFieldDictionary = await this.resolveFieldDictionary(dto.codFieldDictionary);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codFieldValue,
      dto.desFieldValue,
      { IdeFieldDictionary: ideFieldDictionary },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateFieldValueDto, actor: string): Promise<SFieldValue> {
    const extra: Record<string, unknown> = {};
    if (dto.codFieldDictionary !== undefined) {
      extra.IdeFieldDictionary = await this.resolveFieldDictionary(dto.codFieldDictionary);
    }
    return this.crud.update(id, dto.desFieldValue, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SFieldValue> {
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
