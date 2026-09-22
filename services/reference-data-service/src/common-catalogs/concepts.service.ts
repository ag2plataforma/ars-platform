import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SConcept } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateConceptDto } from './dto/create-concept.dto';
import { UpdateConceptDto } from './dto/update-concept.dto';

const INCLUDE = { SConceptType: true, SState: true } as const;

/**
 * `SConcept` -- lo que `SCalculationRule.CodConcept` referencia (ver
 * `docs/01-especificacion-motor-negocio-actual.md`, §3): el concepto que
 * calcula cada regla de la cadena (ej. "PRIMA_NETA", "IMPUESTO",
 * "PRIMA_TOTAL"). Sin CRUD en ningún servicio hasta ahora -- prerequisito
 * real para poder dar de alta una regla de cálculo desde
 * `product-rating-service`/`CalculationRulesController`, no solo desde
 * `db:seed-example-rules`. Va acá (no en `product-rating-service`)
 * porque también lo consumen `billing-service` y `underwriting-service`
 * (ver `receipts.service.ts`/`contracts.service.ts`), igual criterio que
 * el resto de `CommonCatalogsModule`.
 */
@Injectable()
export class ConceptsService {
  private readonly crud: CatalogCrudService<SConcept>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SConcept>(
      prisma.sConcept,
      'CodConcept',
      'DesConcept',
      'IdeConcept',
      'concepto',
      INCLUDE,
    );
  }

  findAll(): Promise<SConcept[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SConcept> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateConceptDto, actor: string): Promise<SConcept> {
    const extra = await this.buildExtra(dto);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codConcept, dto.desConcept, extra, activeStateId, actor);
  }

  async update(id: string, dto: UpdateConceptDto, actor: string): Promise<SConcept> {
    const extra = await this.buildExtra(dto);
    return this.crud.update(id, dto.desConcept, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SConcept> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async buildExtra(dto: CreateConceptDto | UpdateConceptDto): Promise<Record<string, unknown>> {
    const extra: Record<string, unknown> = {};
    if (dto.desShort !== undefined) extra.DesShort = dto.desShort;
    if (dto.desLarge !== undefined) extra.DesLarge = dto.desLarge;
    if (dto.codConceptType !== undefined) {
      const conceptType = await this.prisma.sConceptType.findFirst({
        where: { CodConceptType: dto.codConceptType },
      });
      if (!conceptType) {
        throw new NotFoundException(`No existe tipo de concepto con código "${dto.codConceptType}"`);
      }
      extra.IdeConceptType = conceptType.IdeConceptType;
    }
    return extra;
  }
}
