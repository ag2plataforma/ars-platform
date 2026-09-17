import { Injectable } from '@nestjs/common';
import { PrismaService, SFieldDictionary } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateFieldDictionaryDto } from './dto/create-field-dictionary.dto';
import { UpdateFieldDictionaryDto } from './dto/update-field-dictionary.dto';

/**
 * `SFieldDictionary` -- el diccionario de "campos" que usa el resto del
 * sistema para referirse a un dato de negocio por código en vez de por
 * nombre de columna: lo consumen los factores de tarifa
 * (`SRateFactor.IdeFieldDictionary`, ver product-rating-service) y la
 * sustitución de custom fields dentro de una fórmula de `SCalculationRule`
 * (`substituteFieldTokens` en `RulesEngineService`, que resuelve tokens
 * como `EDAD` contra el código de este catálogo).
 *
 * OJO -- esto NO es el motor de "atributos personalizables"/flujos
 * configurables completo (`SAttribute`, `SAttributeProperty`,
 * `SModelAttribute`, `SEntity`, `SFlowStep`, que enlaza con el JSON
 * `RiskAttributeValue` de `TQuoteRisk`/`TFileRisk` -- ver
 * `PrismaAttributeValueResolver` en `@ars-platform/database` para cómo se
 * resuelve `attribute('COD')` en una fórmula). Ese motor, ya investigado
 * y confirmado contra código y datos reales, vive en
 * `../attribute-engine/` -- este `SFieldDictionary` es un catálogo más
 * simple y anterior en la cadena, que además consumen los factores de
 * tarifa y el resto de custom fields.
 */
@Injectable()
export class FieldDictionaryService {
  private readonly crud: CatalogCrudService<SFieldDictionary>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SFieldDictionary>(
      this.prisma.sFieldDictionary,
      'CodFieldDictionary',
      'DesFieldDictionary',
      'IdeFieldDictionary',
      'campo del diccionario',
    );
  }

  findAll(): Promise<SFieldDictionary[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SFieldDictionary> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateFieldDictionaryDto, actor: string): Promise<SFieldDictionary> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codFieldDictionary, dto.desFieldDictionary, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateFieldDictionaryDto, actor: string): Promise<SFieldDictionary> {
    return this.crud.update(id, dto.desFieldDictionary, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SFieldDictionary> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
