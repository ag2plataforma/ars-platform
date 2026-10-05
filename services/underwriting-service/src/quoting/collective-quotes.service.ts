import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { QuotesService } from './quotes.service';
import { CollectiveInsuredDto, CreateCollectiveQuoteDto } from './dto/create-collective-quote.dto';

/** Tope de asegurados por colectivo (etapa 1); configurable con `COLLECTIVE_MAX_INSUREDS`. */
export function collectiveMaxInsureds(): number {
  const parsed = Number(process.env.COLLECTIVE_MAX_INSUREDS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 100;
}

export interface CollectiveInsuredRow {
  IdeQuoteRisk: string;
  NumRisk: number;
  IdePerson: string;
  DesFirstName: string;
  DesLastName1: string | null;
  DesLastName2: string | null;
  NumIdentification: string | null;
  DesEmail: string;
}

export interface ProductCollectiveConfig {
  IndCollective: boolean;
  CodCollectivePremiumMode: string;
}

/**
 * Cotización de un colectivo (etapa 1): un tomador con N asegurados, cada asegurado = un
 * riesgo (`TQuoteRisk`) con su persona (`TQuoteRiskPerson`). El resto del flujo (precio,
 * personas Tomador/Titular, resumen, aceptar, contratar) es el de siempre: la cotización ya
 * soportaba varios riesgos. Solo el modo de prima `POR_CERTIFICADO` está implementado.
 */
@Injectable()
export class CollectiveQuotesService {
  private readonly logger = new Logger(CollectiveQuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly quotes: QuotesService,
  ) {}

  /** Lee la configuración de colectivo del producto (SQL crudo; si falta el script, no es colectivo). */
  async getProductConfig(ideProduct: string): Promise<ProductCollectiveConfig> {
    try {
      const rows = await this.prisma.$queryRaw<ProductCollectiveConfig[]>`
        SELECT "IndCollective", "CodCollectivePremiumMode" FROM ars_platform."SProduct" WHERE "IdeProduct" = ${ideProduct}::uuid`;
      return rows[0] ?? { IndCollective: false, CodCollectivePremiumMode: 'POR_CERTIFICADO' };
    } catch (err) {
      this.logger.warn(`No se pudo leer IndCollective (¿falta correr setup-collectives.js?): ${(err as Error).message}`);
      return { IndCollective: false, CodCollectivePremiumMode: 'POR_CERTIFICADO' };
    }
  }

  async create(dto: CreateCollectiveQuoteDto, actor: string) {
    const max = collectiveMaxInsureds();
    if (dto.insureds.length > max) {
      throw new BadRequestException(`Un colectivo admite como máximo ${max} asegurados por carga (recibidos: ${dto.insureds.length})`);
    }

    const [ideProduct, ideDistributionChannel, ideDistributionWay, ideRiskProduct] = await Promise.all([
      this.quotes.resolveProduct(dto.codProduct),
      this.quotes.resolveDistributionChannel(dto.codDistributionChannel),
      this.quotes.resolveDistributionWay(dto.codDistributionWay),
      this.quotes.resolveRiskProduct(dto.codRiskProduct),
    ]);

    const config = await this.getProductConfig(ideProduct);
    if (!config.IndCollective) {
      throw new ConflictException(`El producto "${dto.codProduct}" no está configurado como colectivo`);
    }
    if (config.CodCollectivePremiumMode !== 'POR_CERTIFICADO') {
      throw new ConflictException(
        `El modo de prima "${config.CodCollectivePremiumMode}" todavía no está disponible: por ahora solo se admite "POR_CERTIFICADO"`,
      );
    }

    this.assertNoDuplicatesInFile(dto.insureds);

    const [numQuote, ideQuoteInitial, ideQuoteRiskInitial, ideActiveState] = await Promise.all([
      this.quotes.generateNumQuote(dto.codProduct),
      this.stateMachine.getInitialState('TQuote'),
      this.stateMachine.getInitialState('TQuoteRisk'),
      this.stateMachine.getStateByCode('ACTIVO'),
    ]);

    const idQuote = await this.prisma.$transaction(
      async (tx) => {
        const persons: string[] = [];
        const errors: string[] = [];
        for (const [index, insured] of dto.insureds.entries()) {
          try {
            persons.push(await this.findOrCreatePerson(insured, ideActiveState, actor, tx));
          } catch (err) {
            errors.push(`Fila ${index + 1}: ${(err as Error).message}`);
          }
        }
        if (errors.length > 0) {
          throw new BadRequestException(errors.slice(0, 15).join(' | ') + (errors.length > 15 ? ` (y ${errors.length - 15} más)` : ''));
        }

        const now = new Date();
        const quote = await tx.tQuote.create({
          data: {
            NumQuote: numQuote,
            IdeDistributionChannel: ideDistributionChannel,
            IdeProduct: ideProduct,
            IdeDistributionWay: ideDistributionWay,
            TstQuote: now,
            IdeState: ideQuoteInitial,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
            TQuoteRisk: {
              create: dto.insureds.map((insured, index) => ({
                IdeRiskProduct: ideRiskProduct,
                NumRisk: index + 1,
                RiskAttributeValue: insured.riskAttributeValue ?? {},
                IdeState: ideQuoteRiskInitial,
                UsrCreation: actor,
                TstCreation: now,
                UsrModification: actor,
                TstModification: now,
              })),
            },
          },
          include: { TQuoteRisk: { select: { IdeQuoteRisk: true, NumRisk: true } } },
        });

        for (const risk of quote.TQuoteRisk) {
          await tx.$executeRaw`
            INSERT INTO ars_platform."TQuoteRiskPerson"
              ("IdeQuoteRisk", "IdePerson", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
            VALUES (${risk.IdeQuoteRisk}::uuid, ${persons[risk.NumRisk - 1]}::uuid, ${actor}, ${now}, ${actor}, ${now})`;
        }
        return quote.IdeQuote;
      },
      { timeout: 2 * 60 * 1000, maxWait: 10_000 },
    );

    return { ideQuote: idQuote, numQuote, insuredCount: dto.insureds.length };
  }

  /** Asegurados de una cotización (en el orden de carga). */
  async listInsureds(ideQuote: string): Promise<CollectiveInsuredRow[]> {
    const quote = await this.prisma.tQuote.findUnique({ where: { IdeQuote: ideQuote }, select: { IdeQuote: true } });
    if (!quote) throw new NotFoundException(`No existe cotización con id "${ideQuote}"`);
    return this.prisma.$queryRaw<CollectiveInsuredRow[]>`
      SELECT r."IdeQuoteRisk", r."NumRisk", p."IdePerson", p."DesFirstName", p."DesLastName1", p."DesLastName2",
             p."NumIdentification", p."DesEmail"
        FROM ars_platform."TQuoteRisk" r
        JOIN ars_platform."TQuoteRiskPerson" rp ON rp."IdeQuoteRisk" = r."IdeQuoteRisk"
        JOIN ars_platform."TPerson" p ON p."IdePerson" = rp."IdePerson"
       WHERE r."IdeQuote" = ${ideQuote}::uuid
       ORDER BY r."NumRisk"`;
  }

  /**
   * Aplica UN plan a todos los asegurados (el colectivo se vende con un único plan): marca como
   * seleccionado el plan de cada riesgo cuyo código coincide y deselecciona los demás.
   */
  async selectPlanForAll(ideQuote: string, codPlanProduct: string, actor: string) {
    const risks = await this.prisma.tQuoteRisk.findMany({
      where: { IdeQuote: ideQuote },
      include: { TQuoteRiskPlan: { include: { SPlanProductRisk: { include: { SPlanProduct: true } } } } },
    });
    if (risks.length === 0) throw new NotFoundException(`No existe cotización con id "${ideQuote}" o no tiene riesgos`);

    const toSelect: string[] = [];
    for (const risk of risks) {
      const plan = risk.TQuoteRiskPlan.find((p) => p.SPlanProductRisk.SPlanProduct.CodPlanProduct === codPlanProduct);
      if (!plan) {
        throw new ConflictException(
          `El plan "${codPlanProduct}" no está disponible para el asegurado nº ${risk.NumRisk} (¿se cotizó ya el colectivo?)`,
        );
      }
      toSelect.push(plan.IdeQuoteRiskPlan);
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.tQuoteRiskPlan.updateMany({
        where: { TQuoteRisk: { IdeQuote: ideQuote }, NOT: { IdeQuoteRiskPlan: { in: toSelect } } },
        data: { IndSelected: false, UsrModification: actor, TstModification: now },
      }),
      this.prisma.tQuoteRiskPlan.updateMany({
        where: { IdeQuoteRiskPlan: { in: toSelect } },
        data: { IndSelected: true, UsrModification: actor, TstModification: now },
      }),
    ]);
    return this.quotes.buildPricingResult(ideQuote);
  }

  /** ¿La cotización es colectiva (algún riesgo con asegurado)? */
  async isCollectiveQuote(ideQuote: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<boolean> {
    try {
      const rows = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM ars_platform."TQuoteRiskPerson" rp
          JOIN ars_platform."TQuoteRisk" r ON r."IdeQuoteRisk" = rp."IdeQuoteRisk"
         WHERE r."IdeQuote" = ${ideQuote}::uuid`;
      return (rows[0]?.n ?? 0) > 0;
    } catch {
      return false; // tabla aún sin crear (script sin correr)
    }
  }

  // --- personas ------------------------------------------------------------------------------

  private assertNoDuplicatesInFile(insureds: CollectiveInsuredDto[]): void {
    const emails = new Map<string, number>();
    const docs = new Map<string, number>();
    const errors: string[] = [];
    insureds.forEach((insured, index) => {
      const email = insured.desEmail.trim().toLowerCase();
      if (emails.has(email)) errors.push(`Fila ${index + 1}: el correo ${insured.desEmail} está repetido (fila ${emails.get(email)})`);
      else emails.set(email, index + 1);
      if (insured.numIdentification?.trim()) {
        const key = `${insured.codIdentificationType ?? ''}|${insured.numIdentification.trim().toUpperCase()}`;
        if (docs.has(key)) errors.push(`Fila ${index + 1}: el documento ${insured.numIdentification} está repetido (fila ${docs.get(key)})`);
        else docs.set(key, index + 1);
      }
    });
    if (errors.length > 0) {
      throw new BadRequestException(errors.slice(0, 15).join(' | ') + (errors.length > 15 ? ` (y ${errors.length - 15} más)` : ''));
    }
  }

  /** Versión pública para otros módulos (alta de asegurado en un contrato colectivo). */
  async findOrCreateInsuredPerson(
    insured: CollectiveInsuredDto,
    actor: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const ideActiveState = await this.stateMachine.getStateByCode('ACTIVO');
    return this.findOrCreatePerson(insured, ideActiveState, actor, tx);
  }

  /** Reutiliza la persona si ya existe (por correo o documento) y, si no, la crea como `PersonsService.create`. */
  private async findOrCreatePerson(
    insured: CollectiveInsuredDto,
    ideActiveState: string,
    actor: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const email = insured.desEmail.trim();
    let ideIdentificationType: string | undefined;
    if (insured.codIdentificationType) {
      const type = await tx.sIdentificationType.findFirst({ where: { CodIdentificationType: insured.codIdentificationType } });
      if (!type) throw new Error(`no existe el tipo de documento "${insured.codIdentificationType}"`);
      ideIdentificationType = type.IdeIdentificationType;
    }
    const numIdentification = insured.numIdentification?.trim() || undefined;
    if (numIdentification && !ideIdentificationType) {
      throw new Error('si se indica el documento hay que indicar también su tipo');
    }

    const byEmail = await tx.tPerson.findFirst({ where: { DesEmail: { equals: email, mode: 'insensitive' } } });
    const byDoc =
      numIdentification && ideIdentificationType
        ? await tx.tPerson.findFirst({ where: { IdeIdentificationType: ideIdentificationType, NumIdentification: numIdentification } })
        : null;
    if (byEmail && byDoc && byEmail.IdePerson !== byDoc.IdePerson) {
      throw new Error(`el correo ${email} pertenece a una persona distinta de la del documento ${numIdentification}`);
    }
    if (byEmail || byDoc) return (byEmail ?? byDoc)!.IdePerson;

    let birthdate: Date | undefined;
    if (insured.tstBirthdate) {
      birthdate = new Date(insured.tstBirthdate);
      if (Number.isNaN(birthdate.getTime())) throw new Error(`fecha de nacimiento inválida "${insured.tstBirthdate}"`);
    }
    const now = new Date();
    const created = await tx.tPerson.create({
      data: {
        DesFirstName: insured.desFirstName.trim(),
        DesLastName1: insured.desLastName1?.trim() || null,
        DesLastName2: insured.desLastName2?.trim() || null,
        DesEmail: email,
        IdeIdentificationType: ideIdentificationType ?? null,
        NumIdentification: numIdentification ?? null,
        TstBirthdate: birthdate ?? null,
        IndLead: true,
        IndClient: false,
        IdeState: ideActiveState,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
    return created.IdePerson;
  }
}
