import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import {
  ADJUSTMENT_VALUE_RESOLVER,
  AdjustmentValueResolver,
  PROCESS_FLOW_RESOLVER,
  ProcessFlowResolver,
  RulesEngineService,
  SOCIAL_IMPACT_CONFIG_RESOLVER,
  SocialImpactConfigResolver,
  StateMachineService,
  STEP_CODE_SOCIAL_IMPACT,
} from '@ars-platform/shared-common';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { ListQuotesDto } from './dto/list-quotes.dto';
import { SocialImpactHttpClient } from '../social-impact/social-impact-http.client';
import { SubmitSocialImpactAnswersDto } from '../social-impact/dto/submit-social-impact-answers.dto';

/** Forma expuesta en `buildPricingResult` -- ver el comentario ahi y en
 *  `resolveSocialImpact`. */
type SocialImpactInfo =
  | { active: false }
  | { active: true; answered: false }
  | {
      active: true;
      answered: true;
      kgCo2Year: number;
      cfpScore: number;
      sipScore: number;
      combinedScore: number;
      pctPrimaAdjustment: number;
    };

/**
 * Motor de cotización real, equivalente a `FQuote`/`FQuoteRiskPlan`/
 * `FQuoteCoverage`/`FQuoteCoverageConcept` -- confirmado contra el
 * código fuente real (ver
 * `packages/database/scripts/investigate-quote-engine.js` y
 * docs/02-roadmap.md), mismo criterio que se usó con `FGetRateValue` y
 * el motor de atributos: no adivinar el algoritmo, confirmarlo primero.
 *
 * Alcance de esta clase: crear una cotización, calcular su precio (la
 * cascada RiskPlan -> Coverage -> CoverageConcept), las mutaciones de
 * selección de plan/cobertura que el original resolvía con CRUD directo
 * (no con una función PL/pgSQL -- confirmado: no existe ninguna función
 * `%quote%` que haga ese UPDATE, es la capa CRUD de LoopBack la que lo
 * hacía), asociar personas a la cotización (`TQuotePerson`, ahora que
 * `party-service` tiene `TPerson`/`SPersonRol` reales), el resumen
 * (equivalente a `FGetQuoteSummary`) y una transición de estado genérica
 * (equivalente a `FQuote_SetState`). DELIBERADAMENTE AFUERA: la cascada
 * de creación de contrato (`FContract` y todo lo que orquesta) -- "el
 * trabajo de mayor riesgo del proyecto" (ver README de este servicio),
 * le toca su propio ítem del roadmap.
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
    @Inject(SOCIAL_IMPACT_CONFIG_RESOLVER)
    private readonly socialImpactConfigResolver: SocialImpactConfigResolver,
    private readonly socialImpactHttpClient: SocialImpactHttpClient,
    @Inject(ADJUSTMENT_VALUE_RESOLVER)
    private readonly adjustmentValueResolver: AdjustmentValueResolver,
    @Inject(PROCESS_FLOW_RESOLVER)
    private readonly processFlowResolver: ProcessFlowResolver,
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
  /**
   * Listado paginado/filtrable de cotizaciones (`GET /quotes`) -- pedido
   * explícito del usuario al probar la Etapa 1 (ver `ListQuotesDto` y
   * docs/02-roadmap.md). Trae, por cotización, lo mínimo para
   * identificarla en una tabla (número, producto, estado, fecha, quién
   * la creó) más el Tomador si ya está asignado (`TQuotePerson` con rol
   * "TOMADOR", igual criterio que `findPersonByRole`) -- sin traer
   * coberturas/planes/montos, que son pesados y no hacen falta en un
   * listado (se consultan recién al abrir una cotización puntual, vía
   * `GET /quotes/:id` o `/summary`).
   */
  /** Campos ordenables de `GET /quotes` -- lista cerrada, mismo criterio
   *  que `ContractsService.SORTABLE_FIELDS`. Deliberadamente SIN
   *  "tomador" (se resuelve vía `TQuotePerson[0]?.TPerson`, sin relación
   *  directa ordenable de Prisma para ese primer resultado). */
  private static readonly SORTABLE_FIELDS: Record<
    string,
    (dir: Prisma.SortOrder) => Prisma.TQuoteOrderByWithRelationInput
  > = {
    numQuote: (dir) => ({ NumQuote: dir }),
    desProduct: (dir) => ({ SProduct: { DesProduct: dir } }),
    desState: (dir) => ({ SState: { DesState: dir } }),
    tstCreation: (dir) => ({ TstCreation: dir }),
  };

  private resolveOrderBy(query: ListQuotesDto): Prisma.TQuoteOrderByWithRelationInput {
    const factory = query.sortField ? QuotesService.SORTABLE_FIELDS[query.sortField] : undefined;
    if (!factory) return { TstCreation: 'desc' };
    return factory(query.sortOrder === -1 ? 'desc' : 'asc');
  }

  async findAll(query: ListQuotesDto, actor: string) {
    const [ideProduct, ideState] = await Promise.all([
      query.codProduct ? this.resolveProduct(query.codProduct) : undefined,
      query.codState ? this.resolveState(query.codState) : undefined,
    ]);

    const where: Prisma.TQuoteWhereInput = {
      ...(query.all ? {} : { UsrCreation: actor }),
      ...(ideProduct ? { IdeProduct: ideProduct } : {}),
      ...(ideState ? { IdeState: ideState } : {}),
      ...(query.filterNumQuote ? { NumQuote: { contains: query.filterNumQuote, mode: 'insensitive' } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            TstCreation: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.tQuote.findMany({
        where,
        include: {
          SProduct: true,
          SState: true,
          TQuotePerson: { where: { SPersonRol: { CodPersonRol: 'TOMADOR' } }, include: { TPerson: true } },
        },
        orderBy: this.resolveOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tQuote.count({ where }),
    ]);

    return {
      items: rows.map((row) => {
        const tomador = row.TQuotePerson[0]?.TPerson;
        return {
          ideQuote: row.IdeQuote,
          numQuote: row.NumQuote,
          desProduct: row.SProduct.DesProduct,
          codState: row.SState.CodState,
          desState: row.SState.DesState,
          tstCreation: row.TstCreation,
          usrCreation: row.UsrCreation,
          tomador: tomador ? { name: tomador.DesFirstName, lastname: tomador.DesLastName1 } : null,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

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
   * Equivalente a `FGetQuoteSummary` (confirmado contra el código real,
   * ver `packages/database/scripts/find-legacy-function.js FGetQuoteSummary`)
   * -- NO a la rama `QUOTESUMMARY` de `FQuote`, que tiene los dos
   * defectos de sintaxis documentados en el comentario de cabecera de
   * esta clase y nunca llegó a ejecutarse en producción tal cual está.
   *
   * Diferencias deliberadas con el original:
   *  - `plan`/`quotePrime` replican la misma limitación real del
   *    original (subconsultas escalares que asumen un único plan
   *    seleccionado en TODA la cotización, no por riesgo) -- acá con
   *    `findFirst`/`aggregate` en vez de una subconsulta SQL escalar,
   *    así que nunca explota con "more than one row", solo toma el
   *    primero que encuentre si hubiera más de uno.
   *  - `attributes` (`FGetParsedRiskAttribute`) queda DELIBERADAMENTE
   *    AFUERA -- esa función todavía no se investigó contra el código
   *    real; se expone `riskAttributeValue` crudo (el JSON tal cual se
   *    guardó en `TQuoteRisk.RiskAttributeValue`) en su lugar, hasta que
   *    le toque su propia investigación.
   *  - `appliedAdjustments` (ausente en el original): detalle de los
   *    recargos/descuentos ya calculados para esta cotización (Fase 3,
   *    motor genérico de recargos/descuentos -- ver docs/02-roadmap.md),
   *    para que el frontend pueda mostrar QUÉ se aplicó (ej. "-2%
   *    Impacto Social"), no solo `quotePrime` ya ajustado.
   */
  async getSummary(ideQuote: string) {
    const quote = await this.prisma.tQuote.findUnique({
      where: { IdeQuote: ideQuote },
      include: { SProduct: { include: { SCurrency: true } } },
    });
    if (!quote) {
      throw new NotFoundException(`No existe cotización con id "${ideQuote}"`);
    }
    const symbolCurrency = quote.SProduct.SCurrency.SymbolCurrency;

    const [selectedPlan, primeAgg, personPayer, personHolder, risks, appliedAdjustments] = await Promise.all([
      this.prisma.tQuoteRiskPlan.findFirst({
        where: { IndSelected: true, TQuoteRisk: { IdeQuote: ideQuote } },
        include: { SPlanProductRisk: { include: { SPlanProduct: true } } },
      }),
      this.prisma.tQuoteCoverage.aggregate({
        _sum: { Prime: true },
        where: { IndSelected: true, TQuoteRiskPlan: { IndSelected: true, TQuoteRisk: { IdeQuote: ideQuote } } },
      }),
      this.findPersonByRole(ideQuote, 'TOMADOR'),
      this.findPersonByRole(ideQuote, 'TITULAR'),
      this.prisma.tQuoteRisk.findMany({
        where: { IdeQuote: ideQuote },
        include: {
          SRiskProduct: true,
          TQuoteRiskPlan: {
            where: { IndSelected: true },
            include: { TQuoteCoverage: { where: { IndSelected: true }, include: { SCoveragePlan: true } } },
          },
        },
      }),
      // Fase 3, motor genérico de recargos/descuentos (ver
      // docs/02-roadmap.md): detalle de QUÉ se aplicó, no solo el total
      // ya ajustado que suma `primeAgg`. Vacío si la cotización no tiene
      // ningún ajuste calculado todavía.
      this.adjustmentValueResolver.listAppliedAdjustments(ideQuote),
    ]);

    const quotePrime = round2(Number(primeAgg._sum.Prime ?? 0));

    return {
      symbolCurrency,
      plan: selectedPlan?.SPlanProductRisk.SPlanProduct.DesShort ?? null,
      quotePrime,
      // `amountPrimaAdjustment`: importe en moneda de cada ajuste, no solo
      // el `%` (ver docs/02-roadmap.md, "Importe del ajuste en el
      // Resumen"). Derivado matematicamente de `quotePrime` (ya ajustado,
      // ver comentario en `submitSocialImpactAnswers`) y `pctPrimaAdjustment`
      // -- NO requiere que `AdjustmentValueResolver` conozca la prima base:
      // como la formula del producto aplica el ajuste como
      // `PrimaTotal = base * (1 + pct/100)` (ver
      // `apply-social-impact-adjustment-to-prima-total.js`), la base se
      // despeja como `quotePrime / (1 + pct/100)` y el importe es la
      // diferencia. Negativo = descuento, positivo = recargo, igual
      // convencion de signo que `pctPrimaAdjustment`. Asume un unico ajuste
      // multiplicativo total (cierto hoy, unico caso real es
      // 'SOCIAL_IMPACT') -- con mas de un `codAdjustment` compuesto
      // simultaneamente habria que conocer la prima intermedia entre uno y
      // otro para repartir el importe con exactitud.
      appliedAdjustments: appliedAdjustments.map((adjustment) => ({
        ...adjustment,
        amountPrimaAdjustment: round2(
          quotePrime - quotePrime / (1 + adjustment.pctPrimaAdjustment / 100),
        ),
      })),
      personPayer,
      personHolder,
      riskInfo: risks.map((risk) => ({
        desShortRiskProduct: risk.SRiskProduct.DesShort,
        coverages: risk.TQuoteRiskPlan.flatMap((plan) =>
          plan.TQuoteCoverage.map((coverage) => ({
            desShortCoverage: coverage.SCoveragePlan.DesShort,
            coveragePrime: Number(coverage.Prime),
            symbolCurrency,
          })),
        ),
        riskAttributeValue: risk.RiskAttributeValue,
      })),
    };
  }

  private async findPersonByRole(ideQuote: string, codPersonRol: string) {
    const row = await this.prisma.tQuotePerson.findFirst({
      where: { IdeQuote: ideQuote, SPersonRol: { CodPersonRol: codPersonRol } },
      include: { TPerson: true },
    });
    if (!row) return null;
    return {
      name: row.TPerson.DesFirstName,
      lastname: row.TPerson.DesLastName1,
      email: row.TPerson.DesEmail,
      identificationNumber: row.TPerson.NumIdentification,
    };
  }

  /**
   * Asocia una persona a una cotización con un rol (`TQuotePerson`) --
   * sin función PL/pgSQL propia en el original (CRUD directo, igual que
   * `TPerson`/`TQuoteRisk`). `TPerson`/`SPersonRol` viven en el mismo
   * Postgres compartido que ya expone `party-service` -- se resuelven
   * acá directo por Prisma, sin llamada HTTP entre servicios, mismo
   * criterio que ya se usa para `SProduct`/`SDistributionChannel`.
   *
   * Regla agregada explícitamente (ausente como validación en el
   * original, que dependía del frontend Angular): asignar una persona a
   * un rol reemplaza a quien tuviera ese rol antes en esta cotización --
   * `FGetQuoteSummary` asume con una subconsulta escalar que hay como
   * mucho UN TOMADOR y UN TITULAR por cotización (confirmado contra el
   * código real), aunque el `UNIQUE` real de `TQuotePerson` es
   * (`IdeQuote`,`IdePerson`,`IdePersonRol`) y en teoría permitiría más de
   * uno.
   */
  async setPerson(ideQuote: string, idePerson: string, codPersonRol: string, actor: string) {
    const [quote, person, idePersonRol] = await Promise.all([
      this.prisma.tQuote.findUnique({ where: { IdeQuote: ideQuote } }),
      this.prisma.tPerson.findUnique({ where: { IdePerson: idePerson } }),
      this.resolvePersonRol(codPersonRol),
    ]);
    if (!quote) throw new NotFoundException(`No existe cotización con id "${ideQuote}"`);
    if (!person) throw new NotFoundException(`No existe persona con id "${idePerson}"`);

    const existing = await this.prisma.tQuotePerson.findFirst({
      where: { IdeQuote: ideQuote, IdePersonRol: idePersonRol },
    });
    if (existing && existing.IdePerson === idePerson) {
      return existing;
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    if (existing) {
      await this.prisma.tQuotePerson.delete({ where: { IdeQuotePerson: existing.IdeQuotePerson } });
    }
    return this.prisma.tQuotePerson.create({
      data: {
        IdeQuote: ideQuote,
        IdePerson: idePerson,
        IdePersonRol: idePersonRol,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }

  /**
   * Incluye `TAddress`/`TContactData` activos de cada `TPerson` (no solo
   * `TPerson` a secas) para que el paso "Personas" del frontend pueda
   * mostrar si a Tomador/Titular les falta dirección o teléfono móvil
   * SIN un round-trip aparte por persona -- mismo filtro por estado
   * "Activo" que ya usa `PersonsService.findOne` en `party-service`.
   */
  async listPersons(ideQuote: string) {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.prisma.tQuotePerson.findMany({
      where: { IdeQuote: ideQuote },
      include: {
        SPersonRol: true,
        TPerson: {
          include: {
            TAddress: { where: { IdeState: activeStateId } },
            TContactData: { where: { IdeState: activeStateId }, include: { SContactClass: true } },
          },
        },
      },
    });
  }

  async removePerson(ideQuote: string, codPersonRol: string): Promise<void> {
    const idePersonRol = await this.resolvePersonRol(codPersonRol);
    await this.prisma.tQuotePerson.deleteMany({ where: { IdeQuote: ideQuote, IdePersonRol: idePersonRol } });
  }

  private async resolvePersonRol(codPersonRol: string): Promise<string> {
    const row = await this.prisma.sPersonRol.findFirst({ where: { CodPersonRol: codPersonRol } });
    if (!row) throw new NotFoundException(`No existe rol de persona con código "${codPersonRol}"`);
    return row.IdePersonRol;
  }

  /**
   * Equivalente a `FQuote_SetState` (confirmado contra el código real,
   * ver `packages/database/scripts/find-legacy-function.js FQuote_SetState`):
   * aplica una transición de estado (`codOperative`, definido en
   * `SStateRule`) a la cotización Y a TODO su árbol -- todos los
   * `TQuoteRisk`/`TQuoteRiskPlan`/`TQuoteCoverage`/`TQuoteCoverageConcept`,
   * no solo los seleccionados -- igual mecanismo de cascada completa que
   * el original (`FGetState('Next', <tabla>, estadoActual, código)` en
   * cada nivel), acá con el `StateMachineService` ya existente en vez de
   * repetir la lógica de transición.
   *
   * `codOperative` se expone tal cual (sin traducir a un endpoint
   * "aceptar" fijo): el original es genérico -- distintos códigos
   * operativos disparan distintas transiciones según `SStateRule`, y
   * todavía no se investigó cuál es el código real que representa
   * "aceptar" una cotización (ver docs/02-roadmap.md) ni la cascada de
   * creación de contrato (`FContract`) que dispara -- eso queda para su
   * propio ítem, deliberadamente separado por ser "el trabajo de mayor
   * riesgo del proyecto" (ver README de este servicio).
   *
   * Acepta un `tx` opcional (default `this.prisma`) para poder correr
   * DENTRO de la transacción de `ContractsService.create()` -- ese
   * método usa esto para el paso final ("Contratar" sobre la cotización
   * de origen), y necesita que TODA la cascada de contratación sea
   * atómica (ver doc-comment de `ContractsService.create`). Cuando se
   * pasa un `tx` explícito (llamado desde otra transacción en curso), se
   * omite el `buildPricingResult` final -- leería por una conexión
   * (`this.prisma`) distinta de la transacción todavía abierta, así que
   * no reflejaría de forma confiable los cambios recién escritos; ningún
   * llamador actual que pasa `tx` usa el valor de retorno.
   */
  async transitionState(
    ideQuote: string,
    codOperative: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const quote = await tx.tQuote.findUnique({ where: { IdeQuote: ideQuote } });
    if (!quote) {
      throw new NotFoundException(`No existe cotización con id "${ideQuote}"`);
    }

    const now = new Date();
    const nextQuoteState = await this.stateMachine.getNextState('TQuote', quote.IdeState, codOperative);
    await tx.tQuote.update({
      where: { IdeQuote: ideQuote },
      data: { IdeState: nextQuoteState, UsrModification: actor, TstModification: now },
    });

    const risks = await tx.tQuoteRisk.findMany({ where: { IdeQuote: ideQuote } });
    for (const risk of risks) {
      const nextRiskState = await this.stateMachine.getNextState('TQuoteRisk', risk.IdeState, codOperative);
      await tx.tQuoteRisk.update({
        where: { IdeQuoteRisk: risk.IdeQuoteRisk },
        data: { IdeState: nextRiskState, UsrModification: actor, TstModification: now },
      });

      const plans = await tx.tQuoteRiskPlan.findMany({ where: { IdeQuoteRisk: risk.IdeQuoteRisk } });
      for (const plan of plans) {
        const nextPlanState = await this.stateMachine.getNextState('TQuoteRiskPlan', plan.IdeState, codOperative);
        await tx.tQuoteRiskPlan.update({
          where: { IdeQuoteRiskPlan: plan.IdeQuoteRiskPlan },
          data: { IdeState: nextPlanState, UsrModification: actor, TstModification: now },
        });

        const coverages = await tx.tQuoteCoverage.findMany({
          where: { IdeQuoteRiskPlan: plan.IdeQuoteRiskPlan },
        });
        for (const coverage of coverages) {
          const nextCoverageState = await this.stateMachine.getNextState(
            'TQuoteCoverage',
            coverage.IdeState,
            codOperative,
          );
          await tx.tQuoteCoverage.update({
            where: { IdeQuoteCoverage: coverage.IdeQuoteCoverage },
            data: { IdeState: nextCoverageState, UsrModification: actor, TstModification: now },
          });

          const concepts = await tx.tQuoteCoverageConcept.findMany({
            where: { IdeQuoteCoverage: coverage.IdeQuoteCoverage },
          });
          for (const concept of concepts) {
            const nextConceptState = await this.stateMachine.getNextState(
              'TQuoteCoverageConcept',
              concept.IdeState,
              codOperative,
            );
            await tx.tQuoteCoverageConcept.update({
              where: { IdeQuoteCoverageConcept: concept.IdeQuoteCoverageConcept },
              data: { IdeState: nextConceptState, UsrModification: actor, TstModification: now },
            });
          }
        }
      }
    }

    if (tx !== this.prisma) {
      return undefined;
    }
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
   *
   * Idempotente (Fase 3, ver docs/02-roadmap.md): borra los
   * `TQuoteCoverageConcept` existentes de cada cobertura en borrador
   * antes de recalcular, así que se puede llamar más de una vez para la
   * misma cotización sin duplicar conceptos -- necesario porque
   * `submitSocialImpactAnswers` la vuelve a invocar para que
   * `adjustment('SOCIAL_IMPACT')` quede reflejado en `PrimaTotal` en
   * cuanto se contesta el formulario, sin repetir el resto del pipeline
   * de `price()` (`rebuildQuoteRiskPlans`/`populateQuoteCoverages`
   * resetearían selecciones de plan/cobertura ya hechas por el usuario
   * -- por eso esta función se llama sola, no `price()` completo).
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

    // Idempotencia (Fase 3, ver docs/02-roadmap.md): este metodo ahora
    // se llama mas de una vez para la MISMA cotizacion -- ademas de
    // `price()` (una sola vez, con todos los planes en borrador),
    // `submitSocialImpactAnswers` lo vuelve a llamar para que
    // `adjustment('SOCIAL_IMPACT')` quede reflejado en `PrimaTotal` una
    // vez contestado el formulario (ver ese metodo). Sin este borrado
    // previo, la segunda corrida insertaria un segundo juego de
    // TQuoteCoverageConcept por cobertura (PrimaNeta/Impuesto/PrimaTotal
    // duplicados) en vez de reemplazar el calculo anterior -- mismo
    // criterio de limpieza que ya usa `rebuildQuoteRiskPlans` para el
    // caso de re-cotizar.
    const draftCoverageIds = draftCoverages.map((coverage) => coverage.IdeQuoteCoverage);
    if (draftCoverageIds.length > 0) {
      await this.prisma.tQuoteCoverageConcept.deleteMany({ where: { IdeQuoteCoverage: { in: draftCoverageIds } } });
    }

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
        SState: true,
        TContract: { select: { IdeContract: true, NumContract: true } },
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

    // Impacto Social (Fase 3, ver docs/02-roadmap.md) -- puramente
    // informativo, no toca ningun total de prima real todavia. `active:
    // false` es el caso normal para la inmensa mayoria de productos, que
    // no participan. Etapa 2 (formulas reales): si el producto participa
    // pero la cotizacion todavia no tiene `TQuoteSocialImpactAnswer`
    // (el usuario no lleno el formulario todavia), se expone
    // `answered: false` para que el frontend sepa que falta ese paso --
    // ver `submitSocialImpactAnswers` mas abajo, que es quien lo crea.
    const socialImpact = await this.resolveSocialImpact(
      quote.IdeProduct,
      quote.IdeDistributionChannel,
      quote.IdeDistributionWay,
      ideQuote,
    );

    return {
      ideQuote: quote.IdeQuote,
      numQuote: quote.NumQuote,
      symbolCurrency: quote.SProduct.SCurrency.SymbolCurrency,
      // Agregado para poder "retomar" una cotización existente desde el
      // listado (`GET /quotes/:id`, mismo endpoint, ver
      // `apps/backoffice/features/quotes/quotes.component.ts#resumeQuote`
      // y docs/02-roadmap.md): con esto el frontend decide a qué paso
      // saltar (personas/resumen/contrato) sin tener que reconstruir la
      // Etapa 1 (riesgos/coberturas elegidos), que ya viene reflejada acá
      // en `risks` tal cual quedó guardada.
      codState: quote.SState.CodState,
      desState: quote.SState.DesState,
      contract: quote.TContract[0]
        ? { ideContract: quote.TContract[0].IdeContract, numContract: quote.TContract[0].NumContract }
        : null,
      socialImpact,
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

  private async resolveState(codState: string): Promise<string> {
    const row = await this.prisma.sState.findFirst({ where: { CodState: codState } });
    if (!row) throw new NotFoundException(`No existe estado con código "${codState}"`);
    return row.IdeState;
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

  /**
   * Ver el comentario en `buildPricingResult` -- resuelve si el producto
   * participa de Impacto Social y, si participa, si esta cotización ya
   * tiene una respuesta real persistida (`TQuoteSocialImpactAnswer`).
   *
   * Desde 2026-09-23 también consulta `PROCESS_FLOW_RESOLVER`
   * (`SProductProcessFlow`/`SFlowStep`, ver el doc-comment de
   * `ProcessFlowResolver` en `@ars-platform/shared-common`) para poder
   * OCULTAR el paso en productos donde el flujo configurado no lo
   * incluye -- comportamiento aditivo/opt-in: si no hay ningún
   * `SProductProcessFlow` para esta combinación (`ideProcessFlow ===
   * null`), no cambia nada de lo que ya funcionaba (`SSocialImpactConfig`
   * sigue siendo la única fuente de verdad, igual que antes de esta
   * fecha). Solo un flujo EXPLÍCITAMENTE configurado que no incluya
   * `STEP_CODE_SOCIAL_IMPACT` puede apagar el paso.
   */
  private async resolveSocialImpact(
    ideProduct: string,
    ideDistributionChannel: string,
    ideDistributionWay: string,
    ideQuote: string,
  ): Promise<SocialImpactInfo> {
    const config = await this.socialImpactConfigResolver.resolveActiveConfig(ideProduct);
    if (!config) {
      return { active: false };
    }

    const flowResolution = await this.processFlowResolver.resolveActiveSteps({
      ideProduct,
      ideDistributionChannel,
      ideDistributionWay,
    });
    if (flowResolution.ideProcessFlow !== null && !flowResolution.activeSteps.includes(STEP_CODE_SOCIAL_IMPACT)) {
      return { active: false };
    }

    const answer = await this.prisma.tQuoteSocialImpactAnswer.findUnique({ where: { IdeQuote: ideQuote } });
    if (!answer) {
      return { active: true, answered: false };
    }

    return {
      active: true,
      answered: true,
      kgCo2Year: Number(answer.KgCo2Year),
      cfpScore: Number(answer.CfpScore),
      sipScore: Number(answer.SipScore),
      combinedScore: Number(answer.CombinedScore),
      pctPrimaAdjustment: Number(answer.PctPrimaAdjustment),
    };
  }

  /**
   * Recibe las respuestas del formulario de Impacto Social (nuevo paso
   * del wizard de Cotización, ver docs/02-roadmap.md), valida que el
   * producto de la cotización participe, le pide el cálculo real a
   * `social-impact-service` (Etapa 2, llamada HTTP real -- ver
   * `SocialImpactHttpClient`) y persiste el resultado en
   * `TQuoteSocialImpactAnswer` (una fila por cotización -- se reemplaza
   * si el usuario vuelve a llenar el formulario, sin acumular histórico
   * de versiones a propósito, mismo criterio simple que el resto de esta
   * Fase 1 del motor de cotización). Reenvía el `Authorization` crudo
   * del usuario (no el JWT ya decodificado) -- lo necesita el guard JWT
   * de `social-impact-service` para validar el token igual que si el
   * frontend le hubiera pegado directo.
   */
  async submitSocialImpactAnswers(
    ideQuote: string,
    dto: SubmitSocialImpactAnswersDto,
    actor: string,
    authorization: string,
  ) {
    const quote = await this.prisma.tQuote.findUnique({ where: { IdeQuote: ideQuote } });
    if (!quote) {
      throw new NotFoundException(`No existe cotización con id "${ideQuote}"`);
    }

    const config = await this.socialImpactConfigResolver.resolveActiveConfig(quote.IdeProduct);
    if (!config) {
      throw new ConflictException('El producto de esta cotización no participa de Impacto Social');
    }

    const result = await this.socialImpactHttpClient.calculateScore(dto, authorization);
    const now = new Date();
    const data = {
      AnswersJSON: dto as unknown as Prisma.InputJsonValue,
      KgCo2Year: result.kgCo2Year,
      CfpScore: result.cfpScore,
      SipScore: result.sipScore,
      CombinedScore: result.combinedScore,
      PctPrimaAdjustment: result.pctPrimaAdjustment,
    };
    await this.prisma.tQuoteSocialImpactAnswer.upsert({
      where: { IdeQuote: ideQuote },
      create: { IdeQuote: ideQuote, ...data, UsrCreation: actor, TstCreation: now, UsrModification: actor, TstModification: now },
      update: { ...data, UsrModification: actor, TstModification: now },
    });

    // Fase 3, motor generico de recargos/descuentos (ver
    // docs/02-roadmap.md): recalcula la cadena de reglas ahora que
    // `adjustment('SOCIAL_IMPACT')` ya tiene dato -- sin este recalculo,
    // `TQuoteCoverage.Prime` (y por lo tanto el Resumen, que lo suma tal
    // cual en `getSummary`) quedaria congelado en el valor SIN descuento
    // calculado la ultima vez que corrio `price()`, antes de que
    // existiera esta respuesta. Mismo motor, misma cadena de
    // SCalculationRule que ya evalua `price()` -- el % de ajuste entra
    // por la formula del producto (`PrimaTotal`), no por codigo nuevo
    // aca. `ContractsService.createInitialMovements` re-evalua la MISMA
    // cadena al contratar, asi que el descuento llega solo hasta el
    // contrato/factura real tambien, sin tocar ese servicio.
    await this.calculateQuoteCoverageConcepts(quote.IdeProduct, ideQuote, actor);

    return this.buildPricingResult(ideQuote);
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
