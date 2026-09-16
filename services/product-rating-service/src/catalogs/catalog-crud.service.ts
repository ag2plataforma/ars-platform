import { ConflictException, NotFoundException } from '@nestjs/common';

/**
 * CRUD genérico para entidades con la forma `Cod<X>` (único), `Des<X>`,
 * `IdeState` y los 4 campos de auditoría — el molde que comparten los 8
 * catálogos "simples" (`SRiskLevel`, `SRisk`, `SRiskType`, `SCurrency`,
 * `SInsuranceArea`, `SInsuranceLine`, `SDeductibleType`, `SLimitType`, en
 * `../catalogs/`) y, un nivel más arriba, las entidades "de dominio" que
 * también tienen un único código/descripción (`SProduct`, `SPlanProduct`,
 * `SCoverage` en `../domain/`, y `SCalculationRule`). Las entidades que
 * son puras tablas de unión/configuración sin código propio
 * (`SRiskProduct`, `SPlanProductRisk`, `SCoveragePlan`) NO usan esta
 * clase — se escriben a mano, igual que `UsersService` en iam-service.
 *
 * En vez de repetir el mismo Create/List/Get/Update/SetState en cada una,
 * esta clase concentra la lógica; cada consumidor solo aporta su propio
 * delegate de Prisma, los nombres de sus columnas y, opcionalmente, un
 * `include` (ver `risk-levels.service.ts` para el caso más simple, o
 * `risks.service.ts` para uno con una FK propia resuelta por código).
 *
 * Nota sobre los tipos: los métodos del delegate se tipan con `any` en
 * los argumentos a propósito — cada modelo de Prisma genera su propio
 * tipo de `WhereInput`/`CreateInput` incompatible entre sí, y no vale la
 * pena una utilería genérica type-safe para esto. La seguridad de tipos
 * real está en que cada `*.service.ts` que instancia esta clase indica
 * su tipo de fila concreto (`CatalogCrudService<SRiskLevel>`, etc.).
 *
 * Nota de ubicación: esto vive en `product-rating-service` porque es el
 * único consumidor hoy. Si `reference-data-service` llega a scaffoldearse
 * (ver docs/02-roadmap.md), este es el candidato natural a mudarse ahí.
 */

export interface CatalogDelegate<T> {
  findMany(args?: any): Promise<T[]>;
  findUnique(args: any): Promise<T | null>;
  findFirst(args: any): Promise<T | null>;
  create(args: any): Promise<T>;
  update(args: any): Promise<T>;
}

export class CatalogCrudService<T> {
  constructor(
    private readonly delegate: CatalogDelegate<T>,
    private readonly codField: string,
    private readonly desField: string,
    private readonly idField: string,
    /** Nombre en español, para mensajes de error (ej. "nivel de riesgo"). */
    private readonly label: string,
    /**
     * `include` de Prisma opcional, aplicado a list/get/create/update/setState
     * para que el consumidor reciba de una vez las relaciones inmediatas
     * (ej. `{ SProduct: true, SRisk: true }`, o anidado con su propio
     * `orderBy`/`include`, ej. `{ SRateFactor: { orderBy: {...}, include: {...} } }`) en vez de
     * tener que resolverlas aparte. Los 8 catálogos "simples" no lo usan
     * (no tienen relaciones que valga la pena traer siempre).
     */
    private readonly include?: Record<string, unknown>,
  ) {}

  async findAll(): Promise<T[]> {
    return this.delegate.findMany({ orderBy: { [this.desField]: 'asc' }, include: this.include });
  }

  async findOne(id: string): Promise<T> {
    const row = await this.delegate.findUnique({
      where: { [this.idField]: id },
      include: this.include,
    });
    if (!row) {
      throw new NotFoundException(`No existe ${this.label} con id "${id}"`);
    }
    return row;
  }

  async create(
    code: string,
    description: string,
    extra: Record<string, unknown>,
    activeStateId: string,
    actor: string,
  ): Promise<T> {
    const existing = await this.delegate.findFirst({ where: { [this.codField]: code } });
    if (existing) {
      throw new ConflictException(`Ya existe ${this.label} con código "${code}"`);
    }
    const now = new Date();
    return this.delegate.create({
      data: {
        [this.codField]: code,
        [this.desField]: description,
        ...extra,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: this.include,
    });
  }

  async update(
    id: string,
    description: string | undefined,
    extra: Record<string, unknown>,
    actor: string,
  ): Promise<T> {
    await this.findOne(id);
    const data: Record<string, unknown> = {
      ...extra,
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (description) {
      data[this.desField] = description;
    }
    return this.delegate.update({ where: { [this.idField]: id }, data, include: this.include });
  }

  async setState(id: string, stateId: string, actor: string): Promise<T> {
    await this.findOne(id);
    return this.delegate.update({
      where: { [this.idField]: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: this.include,
    });
  }
}
