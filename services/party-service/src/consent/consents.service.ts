import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SConsent } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateConsentDto } from './dto/create-consent.dto';
import { UpdateConsentDto } from './dto/update-consent.dto';
import { RecordConsentDto } from './dto/record-consent.dto';

/**
 * `SConsent`/`TPersonConsent` -- equivalente a `FConsent`, confirmado
 * contra el código real
 * (`packages/database/scripts/investigate-party-service.js`).
 *
 * **Corrección deliberada de un defecto real del original** (decisión
 * explícita del usuario, ver docs/02-roadmap.md): `FConsent` tiene un
 * bug de precedencia de operadores -- el WHERE real es
 * `"IdeProduct" IS NULL OR "IdeProduct" = X AND "IdeState" = Activo AND
 * vigente`, que por precedencia SQL (AND liga más fuerte que OR)
 * equivale a `IdeProduct IS NULL OR ("IdeProduct" = X AND Activo AND
 * vigente)` -- cualquier consentimiento GLOBAL (`IdeProduct` null) se
 * devuelve SIEMPRE, esté o no activo/vigente. Acá (`findApplicable`) el
 * chequeo de estado+vigencia aplica a TODOS los consentimientos,
 * también a los globales.
 *
 * `TPersonConsent` no tiene función PL/pgSQL propia (CRUD directo en el
 * original, igual que `TPerson`) -- `recordAcceptance` es idempotente a
 * propósito (regla agregada, no hay constraint único en el schema): si
 * ya existe un registro para esta persona+consentimiento+cotización, se
 * devuelve tal cual en vez de duplicar.
 */
@Injectable()
export class ConsentsService {
  private readonly crud: CatalogCrudService<SConsent>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SConsent>(
      this.prisma.sConsent,
      'CodConsent',
      'DesConsent',
      'IdeConsent',
      'consentimiento',
    );
  }

  findAll(): Promise<SConsent[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SConsent> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateConsentDto, actor: string): Promise<SConsent> {
    const ideProduct = dto.codProduct ? await this.resolveProduct(dto.codProduct) : null;
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codConsent,
      dto.desConsent,
      {
        IdeProduct: ideProduct,
        TstInitial: new Date(dto.tstInitial),
        TstEnd: new Date(dto.tstEnd),
        DesConsentContent: dto.desConsentContent,
        IndMandatory: dto.indMandatory,
        NumOrder: dto.numOrder,
        IdeTextContent: dto.ideTextContent,
      },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateConsentDto, actor: string): Promise<SConsent> {
    const extra: Record<string, unknown> = {};
    if (dto.codProduct !== undefined) {
      extra.IdeProduct = dto.codProduct === '' ? null : await this.resolveProduct(dto.codProduct);
    }
    if (dto.tstInitial !== undefined) extra.TstInitial = new Date(dto.tstInitial);
    if (dto.tstEnd !== undefined) extra.TstEnd = new Date(dto.tstEnd);
    if (dto.desConsentContent !== undefined) extra.DesConsentContent = dto.desConsentContent;
    if (dto.indMandatory !== undefined) extra.IndMandatory = dto.indMandatory;
    if (dto.numOrder !== undefined) extra.NumOrder = dto.numOrder;
    if (dto.ideTextContent !== undefined) extra.IdeTextContent = dto.ideTextContent;
    return this.crud.update(id, dto.desConsent, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SConsent> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  /** Equivalente a `FConsent`, con la corrección de precedencia explicada en el comentario de cabecera. */
  async findApplicable(codProduct: string): Promise<SConsent[]> {
    const ideProduct = await this.resolveProduct(codProduct);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sConsent.findMany({
      where: {
        OR: [{ IdeProduct: null }, { IdeProduct: ideProduct }],
        IdeState: activeStateId,
        TstInitial: { lte: now },
        TstEnd: { gte: now },
      },
      orderBy: { NumOrder: 'asc' },
    });
  }

  async recordAcceptance(idePerson: string, dto: RecordConsentDto, actor: string) {
    const [person, consent, quote] = await Promise.all([
      this.prisma.tPerson.findUnique({ where: { IdePerson: idePerson } }),
      this.prisma.sConsent.findUnique({ where: { IdeConsent: dto.ideConsent } }),
      this.prisma.tQuote.findUnique({ where: { IdeQuote: dto.ideQuote } }),
    ]);
    if (!person) throw new NotFoundException(`No existe persona con id "${idePerson}"`);
    if (!consent) throw new NotFoundException(`No existe consentimiento con id "${dto.ideConsent}"`);
    if (!quote) throw new NotFoundException(`No existe cotización con id "${dto.ideQuote}"`);

    const existing = await this.prisma.tPersonConsent.findFirst({
      where: { IdePerson: idePerson, IdeConsent: dto.ideConsent, IdeQuote: dto.ideQuote },
    });
    if (existing) return existing;

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.tPersonConsent.create({
      data: {
        IdeConsent: dto.ideConsent,
        IdePerson: idePerson,
        IdeQuote: dto.ideQuote,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      } as any,
    });
  }

  async listForPerson(idePerson: string, ideQuote?: string) {
    return this.prisma.tPersonConsent.findMany({
      where: { IdePerson: idePerson, ...(ideQuote ? { IdeQuote: ideQuote } : {}) },
      include: { SConsent: true },
      orderBy: { TstCreation: 'desc' },
    });
  }

  private async resolveProduct(codProduct: string): Promise<string> {
    const row = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct } });
    if (!row) throw new NotFoundException(`No existe producto con código "${codProduct}"`);
    return row.IdeProduct;
  }
}
