import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { RulesEngineService, StateMachineService } from '@ars-platform/shared-common';
import { CreateQuoteDto } from './dto/create-quote.dto';

/**
 * Motor de cotización real, equivalente a `FQuote`/`FQuoteRiskPlan`/
 * `FQuoteCoverage`/`FQuoteCoverageConcept` -- confirmado contra el
 * código fuente real (ver
 * `packages/database/scripts/investigate-quote-engine.js` y
 * docs/02-roadmap.md), mismo criterio que se usó con `FGetRateValue` y
 * el motor de atributos: no adivinar el algoritmo, confirmarlo primero.
 *
 * Alcance de esta clase (fase 1 del ítem de roadmap): crear una
 * cotización, calcular su precio (la cascada RiskPlan -> Coverage ->
 * CoverageConcept) y las mutaciones de selección de plan/cobertura que
 * el original resolvía con CRUD directo (no con una función PL/pgSQL --
 * confirmado: no existe ninguna función `%quote%` que haga ese UPDATE,
 * es la capa CRUD de LoopBack la que lo hacía). DELIBERADAMENTE AFUERA:
 * `QUOTESUMMARY`/aceptar la cotización (`FQuote_SetState`) -- dependen
 * de `TPerson`/roles (`TOMADOR`/`TITULAR`), que todavía no existen
 * (`party-service` sigue siendo scaffold) -- ver docs/02-roadmap.md.
 *
 * Hallazgo importante NO replicado a propósito: la rama `QUOTESUMMARY`
 * dentro de `FQuote` real tiene dos defectos de sintaxis (una coma
 * faltante en `json_build_object` y un alias de tabla pegado al nombre,
 * `"TAddress"adr` sin separación) presentes IDÉNTICOS en las 3 copias
 * del esquema (ag2ars/entity/temporal) -- indica que esa rama nunca
 * llegó a ejecutarse en producción tal cual está. La función hermana
 * `FGetQuoteSummary` (más simple, sintácticamente válida) es la
 * referencia confiable para cuando se implemente el resumen real.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly rulesEngine: RulesEngineService,
  ) {}

  async create(dto: CreateQuoteDto, actor: string) {
    const [ideProduct, ideDistributionChannel, ideDistributionWay] = await Promise.all([
      this.resolveProduct(dto.codProduct),
      this.resolveDistributionChannel(dto.codDistributionChannel),
      this.resolveDistributionWay(dto.codDistributionWay),
    ]);

    const risks = await Promise.all(
      dto.risks.map(async (risk) => ({
        ideRiskProduct: await this.resolveRiskProduct(risk.codRiskProduct),
        riskAttributeValue: risk.riskAttributeValue ?? {},
      })),
    );

    const [numQuote, ideQuoteInitial, ideQuoteRiskInitial] = await Promise.all([
      this.generateNumQuote(dto.codProduct),
      this.stateMachine.getInitialState('TQuote'),
      this.stateMachine.getInitialState('TQuoteRisk'),
    ]);

    const now = new Date();
    const numRiskByRiskProduct = new Map<string, number>();

    return this.prisma.tQuote.create({
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
          create: risks.map((risk) => {
            const numRisk = (numRiskByRiskProduct.get(risk.ideRiskProduct) ?? 0) + 1;
            numRiskByRiskProduct.set(risk.ideRiskProduct, numRisk);
            return {
              IdeRiskProduct: risk.ideRiskProduct,
              NumRisk: numRisk,
              RiskAttributeValue: risk.riskAttributeValue,
              IdeState: ideQuoteRiskInitial,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            };
          }),
        },
      },
      include: { TQuoteRisk: true },
    });
  }

  /**
   * Equivalente a `FQuote('QUOTEPRICING', ...)`: reconstruye
   * `TQuoteRiskPlan`/`TQuoteCoverage`/`TQuoteCoverageConcept` desde cero
   * para los riesgos todavía en borrador (permite re-cotizar tantas
   * veces como haga falta mientras la cotización no se acepte) y calcula
   * el precio real vía el motor de reglas ya existente.
   */
  async price(ideQuote: string, actor: string) {
    const quote = await this.prisma.tQuote.findUnique({ where: { IdeQuote: ideQuote } });
    if (!quote) {
      throw new NotFoundException(`No existe cotización con id "${ideQuote}"`);
    }

    await this.rebuildQuoteRiskPlans(ideQuote, actor);
    await this.populateQuoteCoverages(ideQuote, actor);
    await this.calculateQuoteCoverageConcepts(quote.IdeProduct, ideQuote, actor);

    return this.buildPricingResult(ideQuote);
  }

  /**
   * Selecciona un plan para un riesgo -- el original lo hacía con un
   * UPDATE directo de `TQuoteRiskPlan.IndSelected` desde la capa CRUD de
   * LoopBack (no hay función PL/pgSQL para esto). Regla agregada acá,
   * ausente como validación explícita en el original pero implícita en
   * `FGetQuoteSummary`/`FQuote('QUOTESUMMARY',...)` (esas consultas
   * asumen un único plan seleccionado por riesgo -- una subconsulta sin
   * `LIMIT`/agregación fallaría con "more than one row" si hubiera más
   * de uno): seleccionar un plan deselecciona los demás del mismo riesgo.
   */
  async selectPlan(ideQuote: string, ideQuoteRisk: string, ideQuoteRiskPlan: string, actor: string) {
    const plan = await this.prisma.tQuoteRiskPlan.findFirst({
      where: {
        IdeQuoteRiskPlan: ideQuoteRiskPlan,
        IdeQuoteRisk: ideQuoteRisk,
        TQuoteRisk: { IdeQuote: ideQuote },
      },
    });
    if (!plan) {
      throw new NotFoundException(`No existe plan "${ideQuoteRiskPlan}" para el riesgo "${ideQuoteRisk}"`);
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.tQuoteRiskPlan.updateMany({
        where: { IdeQuoteRisk: ideQuoteRisk, NOT: { IdeQuoteRiskPlan: ideQuoteRiskPlan } },
        data: { IndSelected: false, UsrModification: actor, TstModification: now },
      }),
      this.prisma.tQuoteRiskPlan.update({
        where: { IdeQuoteRiskPlan: ideQuoteRiskPlan },
        data: { IndSelected: true, UsrModification: actor, TstModification: now },
      }),
    ]);

    return this.buildPricingResult(ideQuote);
  }

  /**
   * Selecciona/deselecciona una cobertura opcional -- mismo caso que
   * `selectPlan`: CRUD directo en el original, sin función PL/pgSQL.
   * Regla agregada acá (ausente como validación explícita en el
   * original, que dependía del frontend Angular para no ofrecer el
   * control): una cobertura obligatoria (`SCoveragePlan.IndMandatory`)
   * no se puede deseleccionar.
   */
  async toggleCoverage(
    ideQuote: string,
    ideQuoteRiskPlan: string,
    ideQuoteCoverage: string,
    selected: boolean,
    actor: string,
  ) {
    const coverage = await this.prisma.tQuoteCoverage.findFirst({
      where: {
        IdeQuoteCoverage: ideQuoteCoverage,
        IdeQuoteRiskPlan: ideQuoteRiskPlan,
        TQuoteRiskPlan: { TQuoteRisk: { IdeQuote: ideQuote } },
      },
      include: { SCoveragePlan: { select: { IndMandatory: true } } },
    });
    if (!coverage) {
      throw new NotFoundException(`No existe cobertura "${ideQuoteCoverage}" en el plan "${ideQuoteRiskPlan}"`);
    }
    if (coverage.SCoveragePlan.IndMandatory && !selected) {
      throw new ConflictException('No se puede deseleccionar una cobertura obligatoria');
    }

    await this.prisma.tQuoteCoverage.update({
      where: { IdeQuoteCoverage: ideQuoteCoverage },
      data: { IndSelected: selected, UsrModification: actor, TstModification: new Date() },
    });

    return this.buildPricingResult(ideQuote);
  }

  /**
   * Equivalente a `FQuoteRiskPlan`: borra la configuración previa de los
   * riesgos todavía en borrador (permite re-cotizar) y la reconstruye
   * con los planes "vigentes" -- confirmado contra el código real:
   * vigente = `SPlanProductRisk.IdeState` en su estado inicial Y
   * `now()` dentro de `[TstInitial, TstEnd]`.
   */
  private async rebuildQuoteRiskPlans(ideQuote: string, actor: string): Promise<void> {
    const ideQuoteRiskInitial = await this.stateMachine.getInitialState('TQuoteRisk');

    const draftRisks = await this.prisma.tQuoteRisk.findMany({
      where: { IdeQuote: ideQuote, IdeState: ideQuoteRiskInitial },
      select: { IdeQuoteRisk: true, IdeRiskProduct: true },
    });
    if (draftRisks.length === 0) return;
    const draftRiskIds = draftRisks.map((risk) => risk.IdeQuoteRisk);

    // Limpieza de una re-cotización previa, de más anidado a menos
    // (igual orden que el original).
    const existingPlans = await this.prisma.tQuoteRiskPlan.findMany({
      where: { IdeQuoteRisk: { in: draftRiskIds } },
      select: { IdeQuoteRiskPlan: true },
    });
    if (existingPlans.length > 0) {
      const planIds = existingPlans.map((plan) => plan.IdeQuoteRiskPlan);
      const existingCoverages = await this.prisma.tQuoteCoverage.findMany({
        where: { IdeQuoteRiskPlan: { in: planIds } },
        select: { IdeQuoteCoverage: true },
      });
      if (existingCoverages.length > 0) {
        const coverageIds = existingCoverages.map((coverage) => coverage.IdeQuoteCoverage);
        await this.prisma.tQuoteCoverageConcept.deleteMany({ where: { IdeQuoteCoverage: { in: coverageIds } } });
      }
      await this.prisma.tQuoteCoverage.deleteMany({ where: { IdeQuoteRiskPlan: { in: planIds } } });
      await this.prisma.tQuoteRiskPlan.deleteMany({ where: { IdeQuoteRisk: { in: draftRiskIds } } });
    }

    const [idePlanProductRiskInitial, ideQuoteRiskPlanInitial] = await Promise.all([
      this.stateMachine.getInitialState('SPlanProductRisk'),
      this.stateMachine.getInitialState('TQuoteRiskPlan'),
    ]);
    const now = new Date();

    for (const risk of draftRisks) {
      const applicablePlans = await this.prisma.sPlanProductRisk.findMany({
        where: {
          IdeRiskProduct: risk.IdeRiskProduct,
          IdeState: idePlanProductRiskInitial,
          TstInitial: { lte: now },
          TstEnd: { gte: now },
        },
        select: { IdePlanProductRisk: true },
      });
      if (applicablePlans.length === 0) continue;
      await this.prisma.tQuoteRiskPlan.createMany({
        data: applicablePlans.map((plan) => ({
          IdeQuoteRisk: risk.IdeQuoteRisk,
          IdePlanProductRisk: plan.IdePlanProductRisk,
          IndSelected: false,
          IdeState: ideQuoteRiskPlanInitial,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        })),
      });
    }
  }

  /**
   * Equivalente a `FQuoteCoverage`: por cada `TQuoteRiskPlan` nuevo,
   * inserta una fila por cada `SCoveragePlan` configurada, con los
   * valores por defecto exactos confirmados contra el código real: fijo
   * (`UpperAmount`/`UpperRate`/`UpperPrime`) si el flag `IndFixed*`
   * correspondiente está activo, si no 0; preseleccionada
   * (`IndSelected`) si y solo si es obligatoria (`IndMandatory`).
   *
   * Nota sobre una inconsistencia real, no un error de esta
   * implementación: el original filtra `SCoveragePlan` por su estado
   * "Initial" acá (`FQuoteCoverage`), pero por el estado con código
   * "Activo" en `FQuoteCoverageConcept` -- en la práctica ambos
   * resuelven al mismo `IdeState` (una `SCoveragePlan` se crea
   * directamente activa, sin pasar por borrador), así que se replica la
   * misma distinción sin intentar "corregirla".
   */
  private async populateQuoteCoverages(ideQuote: string, actor: string): Promise<void> {
    const [ideQuoteRiskPlanInitial, ideCoveragePlanInitial, ideQuoteCoverageInitial] = await Promise.all([
      this.stateMachine.getInitialState('TQuoteRiskPlan'),
      this.stateMachine.getInitialState('SCoveragePlan'),
      this.stateMachine.getInitialState('TQuoteCoverage'),
    ]);

    const draftPlans = await this.prisma.tQuoteRiskPlan.findMany({
      where: { IdeState: ideQuoteRiskPlanInitial, TQuoteRisk: { IdeQuote: ideQuote } },
      select: { IdeQuoteRiskPlan: true, IdePlanProductRisk: true },
    });

    const now = new Date();
    for (const plan of draftPlans) {
      const coveragePlans = await this.prisma.sCoveragePlan.findMany({
        where: { IdePlanProductRisk: plan.IdePlanProductRisk, IdeState: ideCoveragePlanInitial },
      });
      if (coveragePlans.length === 0) continue;
      await this.prisma.tQuoteCoverage.createMany({
        data: coveragePlans.map((coveragePlan) => ({
          IdeQuoteRiskPlan: plan.IdeQuoteRiskPlan,
          IdeCoveragePlan: coveragePlan.IdeCoveragePlan,
          Amount: coveragePlan.IndFixedAmount ? coveragePlan.UpperAmount : 0,
          Rate: coveragePlan.IndFixedRate ? coveragePlan.UpperRate : 0,
          Prime: coveragePlan.IndFixedPrime ? coveragePlan.UpperPrime : 0,
          IndSelected: coveragePlan.IndMandatory,
          IdeState: ideQuoteCoverageInitial,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        })),
      });
    }
  }

  /**
   * Equivalente a `FQuoteCoverageConcept`, con el motor de reglas ya
   * existente (`RulesEngineService`, `@ars-platform/shared-common`) en
   * vez del `EXECUTE` de SQL dinámico original. Por cada cobertura
   * nueva: reglas aplicables por jerarquía Producto > PlanProductRisk >
   * CoveragePlan, evaluadas en orden; si la regla trae `DesColumnName`
   * actualiza esa columna de `TQuoteCoverage`, si no inserta un
   * `TQuoteCoverageConcept`. Al final, `TQuoteCoverage.Prime` se fija al
   * valor del concepto `PrimaTotal` (redondeado a 2 decimales, 0 si no
   * existe) -- igual que el original.
   */
  private async calculateQuoteCoverageConcepts(ideProduct: string, ideQuote: string, actor: string): Promise<void> {
    const [ideQuoteCoverageInitial, ideQuoteCoverageConceptInitial, primaTotalConcept] = await Promise.all([
      this.stateMachine.getInitialState('TQuoteCoverage'),
      this.stateMachine.getInitialState('TQuoteCoverageConcept'),
      this.prisma.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' } }),
    ]);

    const draftCoverages = await this.prisma.tQuoteCoverage.findMany({
      where: { IdeState: ideQuoteCoverageInitial, TQuoteRiskPlan: { TQuoteRisk: { IdeQuote: ideQuote } } },
      include: { TQuoteRiskPlan: { select: { IdePlanProductRisk: true, IdeQuoteRisk: true } } },
      orderBy: { IdeQuoteCoverage: 'asc' },
    });

    for (const coverage of draftCoverages) {
      const rules = await this.rulesEngine.getApplicableRules({
        ideProduct,
        idePlanProductRisk: coverage.TQuoteRiskPlan.IdePlanProductRisk,
        ideCoveragePlan: coverage.IdeCoveragePlan,
      });
      const results = await this.rulesEngine.evaluateChain(rules, {
        origin: 'Quote',
        ideOriginRisk: coverage.TQuoteRiskPlan.IdeQuoteRisk,
        ideCoverageOrMovement: coverage.IdeQuoteCoverage,
      });

      const now = new Date();
      for (const result of results) {
        if (result.columnName) {
          const column = this.resolveQuoteCoverageColumn(result.columnName);
          await this.prisma.tQuoteCoverage.update({
            where: { IdeQuoteCoverage: coverage.IdeQuoteCoverage },
            data: { [column]: result.value, UsrModification: actor, TstModification: now },
          });
        } else {
          await this.prisma.tQuoteCoverageConcept.create({
            data: {
              IdeQuoteCoverage: coverage.IdeQuoteCoverage,
              IdeConcept: result.ideConcept,
              ConceptValue: result.value,
              IdeState: ideQuoteCoverageConceptInitial,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            },
          });
        }
      }

      let prime = 0;
      if (primaTotalConcept) {
        const primaTotalRow = await this.prisma.tQuoteCoverageConcept.findFirst({
          where: { IdeQuoteCoverage: coverage.IdeQuoteCoverage, IdeConcept: primaTotalConcept.IdeConcept },
        });
        prime = primaTotalRow ? round2(Number(primaTotalRow.ConceptValue)) : 0;
      }
      await this.prisma.tQuoteCoverage.update({
        where: { IdeQuoteCoverage: coverage.IdeQuoteCoverage },
        data: { Prime: prime, UsrModification: actor, TstModification: new Date() },
      });
    }
  }

  private resolveQuoteCoverageColumn(desColumnName: string): 'Amount' | 'Rate' | 'Prime' {
    if (desColumnName === 'Amount' || desColumnName === 'Rate' || desColumnName === 'Prime') {
      return desColumnName;
    }
    throw new Error(
      `SCalculationRule.DesColumnName inválido para TQuoteCoverage: "${desColumnName}" (se esperaba Amount/Rate/Prime)`,
    );
  }

  /**
   * JSON de resultado -- forma propia (no una copia literal del JSON que
   * arma `FQuote('QUOTEPRICING',...)`, ver el comentario de esta clase:
   * el ALGORITMO y los VALORES se preservan exactos, la forma de la
   * respuesta es una decisión de API para un frontend que todavía no
   * existe). `basePrice` de cada plan = suma de `Prime` de las
   * coberturas actualmente seleccionadas en ESE plan -- igual que el
   * original, no depende de si el plan mismo fue elegido.
   */
  async buildPricingResult(ideQuote: string) {
    const quote = await this.prisma.tQuote.findUnique({
      where: { IdeQuote: ideQuote },
      include: {
        SProduct: { include: { SCurrency: true } },
        TQuoteRisk: {
          include: {
            SRiskProduct: { include: { SRisk: true } },
            TQuoteRiskPlan: {
              include: {
                SPlanProductRisk: { include: { SPlanProduct: true } },
                TQuoteCoverage: { include: { SCoveragePlan: true } },
              },
            },
          },
        },
      },
    });
    if (!quote) {
      throw new NotFoundException(`No existe cotización con id "${ideQuote}"`);
    }

    const productValidityType = await this.prisma.sProductValidityType.findFirst({
      where: { IdeProduct: quote.IdeProduct },
      include: { SValidityType: true },
    });
    const indAnnual = productValidityType?.SValidityType.IndAnnual ?? false;

    return {
      ideQuote: quote.IdeQuote,
      numQuote: quote.NumQuote,
      symbolCurrency: quote.SProduct.SCurrency.SymbolCurrency,
      risks: quote.TQuoteRisk.map((risk) => ({
        ideQuoteRisk: risk.IdeQuoteRisk,
        numRisk: risk.NumRisk,
        desRisk: risk.SRiskProduct.SRisk.DesRisk,
        plans: risk.TQuoteRiskPlan.map((plan) => {
          const selectedCoverages = plan.TQuoteCoverage.filter((coverage) => coverage.IndSelected);
          const basePrice = round2(selectedCoverages.reduce((sum, coverage) => sum + Number(coverage.Prime), 0));
          return {
            ideQuoteRiskPlan: plan.IdeQuoteRiskPlan,
            indSelected: plan.IndSelected,
            codPlanProduct: plan.SPlanProductRisk.SPlanProduct.CodPlanProduct,
            desShortPlan: plan.SPlanProductRisk.SPlanProduct.DesShort,
            desLargePlan: plan.SPlanProductRisk.SPlanProduct.DesLarge,
            basePrice,
            unit: indAnnual
              ? { desUnitBase: 'Annual', unit: 12, desUnit: 'Month' }
              : { desUnitBase: 'Period', unit: 1, desUnit: 'Day' },
            mandatoryCoverages: plan.TQuoteCoverage.filter((coverage) => coverage.SCoveragePlan.IndMandatory).map(
              mapCoverage,
            ),
            optionalCoverages: plan.TQuoteCoverage.filter((coverage) => !coverage.SCoveragePlan.IndMandatory).map(
              mapCoverage,
            ),
          };
        }),
      })),
    };
  }

  /**
   * Genera `NumQuote` con una secuencia real de Postgres (decisión
   * explícita, ver `packages/database/scripts/setup-quote-number-sequence.js`)
   * en vez de replicar el `split_part`+1 en memoria del original
   * (`FQuote('GETQUOTENUMBER',...)`), que tiene riesgo real de colisión
   * bajo concurrencia. Mismo formato visible `<CodProducto>-<Año>-<N>`;
   * la secuencia es global (no una por producto), así que `N` ya no
   * arranca en 1 para cada producto nuevo.
   */
  private async generateNumQuote(codProduct: string): Promise<string> {
    const result = await this.prisma.$queryRaw<{ nextval: number }[]>`
      SELECT nextval('ars_platform."SeqTQuoteNumber"')::int AS nextval
    `;
    const year = new Date().getFullYear();
    return `${codProduct}-${year}-${result[0].nextval}`;
  }

  private async resolveProduct(codProduct: string): Promise<string> {
    const row = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct } });
    if (!row) throw new NotFoundException(`No existe producto con código "${codProduct}"`);
    return row.IdeProduct;
  }

  private async resolveDistributionChannel(codDistributionChannel: string): Promise<string> {
    const row = await this.prisma.sDistributionChannel.findFirst({
      where: { CodDistributionChannel: codDistributionChannel },
    });
    if (!row) {
      throw new NotFoundException(`No existe canal de distribución con código "${codDistributionChannel}"`);
    }
    return row.IdeDistributionChannel;
  }

  private async resolveDistributionWay(codDistributionWay: string): Promise<string> {
    const row = await this.prisma.sDistributionWay.findFirst({ where: { CodDistributionWay: codDistributionWay } });
    if (!row) throw new NotFoundException(`No existe vía de distribución con código "${codDistributionWay}"`);
    return row.IdeDistributionWay;
  }

  private async resolveRiskProduct(codRiskProduct: string): Promise<string> {
    const row = await this.prisma.sRiskProduct.findFirst({ where: { CodRiskProduct: codRiskProduct } });
    if (!row) throw new NotFoundException(`No existe producto de riesgo con código "${codRiskProduct}"`);
    return row.IdeRiskProduct;
  }
}

function mapCoverage(coverage: {
  IdeQuoteCoverage: string;
  IndSelected: boolean;
  Amount: unknown;
  Rate: unknown;
  Prime: unknown;
  SCoveragePlan: { DesShort: string | null; DesLarge: string | null };
}) {
  return {
    ideQuoteCoverage: coverage.IdeQuoteCoverage,
    desShortCoverage: coverage.SCoveragePlan.DesShort,
    desLargeCoverage: coverage.SCoveragePlan.DesLarge,
    indSelected: coverage.IndSelected,
    amount: Number(coverage.Amount),
    rate: Number(coverage.Rate),
    prime: Number(coverage.Prime),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
