import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { RulesEngineService, StateMachineService } from '@ars-platform/shared-common';
import { QuotesService } from '../quoting/quotes.service';
import { CreateContractDto } from './dto/create-contract.dto';

/**
 * Cascada de creación de contrato, equivalente a `FContract('CONTRACTNEW', ...)`
 * -- "el trabajo de mayor riesgo del proyecto" (ver README de este servicio
 * y docs/02-roadmap.md). Confirmado contra el código real de `FContract`
 * (dispatcher con los 5 casos CONTRACTNEW/CANCELCONTRACT/GETJSONBY/
 * GETNUMBER/SETSTATE, idéntico en las 3 copias del esquema
 * ag2ars/entity/temporal -- ver `packages/database/scripts/investigate-contract-engine.js`)
 * y de sus operaciones (`FContractOperation`, `FContractBilling`,
 * `FCoverageMovement`, `FMovementConcept`, `FRiskCoverage`, `FFileRisk`,
 * `FReceipt`/`FReceipt_GetNumber`), más `FContractPerson`/`FContractFilePerson`
 * (confirmados en la investigación previa de party-service, ver
 * docs/02-roadmap.md ítem de party-service y `TPerson.IndClient`).
 *
 * ORDEN de la cascada (confirmado contra el `FContract` real): validar
 * precondición (cotización en estado "Aceptado" y sin contrato previo) ->
 * número de contrato -> `TContract` -> `TContractOperation('CONTGENE')` ->
 * personas del contrato (`TContractPerson`, marca `TPerson.IndClient`) ->
 * canal de distribución (`TContractDistributionChannel`) -> períodos de
 * facturación (`TContractBilling`) -> archivo(s) de póliza (`TContractFile`)
 * -> riesgos (`TFileRisk`) -> coberturas (`TRiskCoverage`) + requisitos
 * copiados (`TContractRequirement`) -> movimiento inicial de cobertura y su
 * prima (`TCoverageMovement`/`TMovementConcept`, vía el mismo
 * `RulesEngineService` ya usado para cotizar) -> recibo de la operación
 * (`TReceipt`/`TReceiptDetail`) -> transición a "Activar" de TODO el árbol
 * del contrato -> transición a "Contratar" de la cotización de origen
 * (marca la cotización como convertida, reutilizando `QuotesService.transitionState`).
 *
 * DELIBERADAMENTE AFUERA de esta primera pasada (ver docs/02-roadmap.md):
 *  - `CANCELCONTRACT` (cascada de anulación completa, propio ítem futuro).
 *  - `FReceipt('BILLFRACTION')` -- confirmado como stub no-operativo en el
 *    original.
 *  - Contratos colectivos reales (`IndCollective=true` con múltiples
 *    `TContractFile`, uno por miembro): esta pasada crea siempre UN solo
 *    `TContractFile` (`NumContractFile=1`) por contrato. `TContractFilePerson`
 *    (personas por archivo, ej. asegurados/beneficiarios de un colectivo)
 *    queda sin poblar -- no existe en `TQuotePerson` un nivel de granularidad
 *    por archivo del que copiar, así que no hay dato de origen real para
 *    esta fase (la cotización solo asocia personas al nivel de la cotización
 *    completa). Se retoma cuando se investiguen los colectivos reales.
 *  - Cálculo de comisión (`SCommissionTree`/`SCommissionTable`/`SCommission`)
 *    sobre el recibo generado: `TReceipt` no tiene columna de comisión en el
 *    modelo real (es una tabla de configuración, no de movimiento) y el
 *    algoritmo exacto de cómo el original la aplica a la prima/fee del
 *    recibo no se re-confirmó contra el código fuente literal en esta
 *    ronda -- `TReceipt.Fee` se deja en 0 con un TODO explícito hasta
 *    confirmarlo, en vez de adivinar la fórmula.
 *  - `TMovementConcept`/`FMovementConcept('SetNetPrime', ...)`: se replica
 *    únicamente `SetRulePrime` (idéntico patrón ya confirmado y en
 *    producción del lado de `QuotesService.calculateQuoteCoverageConcepts`,
 *    reutilizando `RulesEngineService.evaluateChain` con `origin: 'Contract'`
 *    tal como confirma el doc-comment de `EvaluationContext`). El concepto
 *    de prima neta (`SetNetPrime`) queda pendiente de confirmar su código
 *    real de `SConcept` antes de replicarlo.
 *  - `ContractAge`: columna real de `TContract` cuya fórmula exacta
 *    (¿edad de la persona asegurada? ¿antigüedad del producto?) no se
 *    re-confirmó contra el código fuente en esta ronda -- se persiste en 0
 *    con un TODO explícito, mismo criterio que los demás placeholders de
 *    esta clase.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly rulesEngine: RulesEngineService,
    private readonly quotesService: QuotesService,
  ) {}

  /**
   * Punto de entrada de toda la cascada. Ejecuta cada paso dentro de su
   * propia operación de Prisma (igual criterio que `QuotesService`, que
   * tampoco envuelve toda la cascada de cotización en una única
   * transacción) -- una futura revisión podría envolver esto en
   * `$transaction` si se confirma que el original es atómico.
   */
  async create(ideQuote: string, dto: CreateContractDto, actor: string) {
    const quote = await this.prisma.tQuote.findUnique({
      where: { IdeQuote: ideQuote },
      include: { TContract: { select: { IdeContract: true } } },
    });
    if (!quote) {
      throw new NotFoundException(`No existe cotización con id "${ideQuote}"`);
    }
    if (quote.TContract.length > 0) {
      throw new ConflictException(`La cotización "${ideQuote}" ya tiene un contrato asociado`);
    }

    const ideQuoteAceptadoState = await this.stateMachine.getStateByCode('Aceptado');
    if (quote.IdeState !== ideQuoteAceptadoState) {
      throw new ConflictException(
        `La cotización "${ideQuote}" debe estar en estado "Aceptado" para poder contratarse`,
      );
    }

    const contract = await this.buildContract(quote, dto, actor);
    await this.setContractPersons(quote.IdeQuote, contract.IdeContract, actor);
    await this.setContractDistributionChannel(quote.IdeDistributionChannel, contract, actor);
    await this.setContractBilling(contract, actor);

    const contractFile = await this.createContractFile(contract, actor);
    const contractOperation = await this.createInitialContractOperation(contract.IdeContract, actor);

    const riskCoverages = await this.copyRisksAndCoverages(
      quote.IdeQuote,
      contract.IdeProduct,
      contractFile.IdeContractFile,
      actor,
    );
    await this.createInitialMovements(riskCoverages, contractOperation.IdeContractOperation, actor);
    await this.createInitialReceipt(contract, contractFile, contractOperation, riskCoverages, actor);

    await this.activateContractTree(contract.IdeContract, actor);
    await this.quotesService.transitionState(quote.IdeQuote, 'Contratar', actor);

    return this.findOne(contract.IdeContract);
  }

  async findOne(ideContract: string) {
    const contract = await this.prisma.tContract.findUnique({
      where: { IdeContract: ideContract },
      include: {
        SProduct: { include: { SCurrency: true } },
        SValidityType: true,
        SPaymentFraction: true,
        TContractFile: {
          include: {
            TFileRisk: {
              include: {
                SRiskProduct: true,
                TRiskCoverage: { include: { SCoveragePlan: true, TCoverageMovement: true } },
              },
            },
          },
        },
      },
    });
    if (!contract) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }
    return contract;
  }

  /**
   * Equivalente a `FContract('SETSTATE', ...)`: aplica una transición al
   * contrato Y a todo su árbol (`TContractFile` -> `TFileRisk` ->
   * `TRiskCoverage` -> `TCoverageMovement`) -- mismo mecanismo de cascada
   * completa que `QuotesService.transitionState`, reutilizando
   * `StateMachineService`.
   */
  async transitionState(ideContract: string, codOperative: string, actor: string) {
    const contract = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!contract) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }
    await this.applyStateCascade(ideContract, codOperative, actor);
    return this.findOne(ideContract);
  }

  private async activateContractTree(ideContract: string, actor: string): Promise<void> {
    await this.applyStateCascade(ideContract, 'Activar', actor);
  }

  private async applyStateCascade(ideContract: string, codOperative: string, actor: string): Promise<void> {
    const now = new Date();
    const contract = await this.prisma.tContract.findUniqueOrThrow({ where: { IdeContract: ideContract } });
    const nextContractState = await this.stateMachine.getNextState('TContract', contract.IdeState, codOperative);
    await this.prisma.tContract.update({
      where: { IdeContract: ideContract },
      data: { IdeState: nextContractState, UsrModification: actor, TstModification: now },
    });

    const files = await this.prisma.tContractFile.findMany({ where: { IdeContract: ideContract } });
    for (const file of files) {
      const nextFileState = await this.stateMachine.getNextState('TContractFile', file.IdeState, codOperative);
      await this.prisma.tContractFile.update({
        where: { IdeContractFile: file.IdeContractFile },
        data: { IdeState: nextFileState, UsrModification: actor, TstModification: now },
      });

      const fileRisks = await this.prisma.tFileRisk.findMany({ where: { IdeContractFile: file.IdeContractFile } });
      for (const fileRisk of fileRisks) {
        const nextFileRiskState = await this.stateMachine.getNextState('TFileRisk', fileRisk.IdeState, codOperative);
        await this.prisma.tFileRisk.update({
          where: { IdeFileRisk: fileRisk.IdeFileRisk },
          data: { IdeState: nextFileRiskState, UsrModification: actor, TstModification: now },
        });

        const riskCoverages = await this.prisma.tRiskCoverage.findMany({
          where: { IdeFileRisk: fileRisk.IdeFileRisk },
        });
        for (const riskCoverage of riskCoverages) {
          const nextCoverageState = await this.stateMachine.getNextState(
            'TRiskCoverage',
            riskCoverage.IdeState,
            codOperative,
          );
          await this.prisma.tRiskCoverage.update({
            where: { IdeRiskCoverage: riskCoverage.IdeRiskCoverage },
            data: { IdeState: nextCoverageState, UsrModification: actor, TstModification: now },
          });

          const movements = await this.prisma.tCoverageMovement.findMany({
            where: { IdeRiskCoverage: riskCoverage.IdeRiskCoverage },
          });
          for (const movement of movements) {
            const nextMovementState = await this.stateMachine.getNextState(
              'TCoverageMovement',
              movement.IdeState,
              codOperative,
            );
            await this.prisma.tCoverageMovement.update({
              where: { IdeCoverageMovement: movement.IdeCoverageMovement },
              data: { IdeState: nextMovementState, UsrModification: actor, TstModification: now },
            });
          }
        }
      }
    }
  }

  /**
   * Equivalente a la parte de `FContract('CONTRACTNEW', ...)` que arma la
   * fila de `TContract`. `TstEnd = TstInitial + 1 año` siempre: correcto
   * para vigencia anual (`SValidityType.IndAnnual=true`) y, para el resto
   * de los tipos de vigencia (`TempPack`/`TempDays`/`TempDate`), el mismo
   * placeholder que el propio original -- que tiene un TODO explícito
   * (`*****`) sin implementar esas ramas y cae también a `+1 año`
   * (confirmado contra el código real). Se replica ese placeholder tal
   * cual, no es un defecto de esta implementación.
   */
  private async buildContract(
    quote: { IdeQuote: string; IdeProduct: string; IdeDistributionChannel: string },
    dto: CreateContractDto,
    actor: string,
  ) {
    const productValidityType = await this.prisma.sProductValidityType.findFirst({
      where: { IdeProduct: quote.IdeProduct },
      select: { IdeValidityType: true },
    });
    if (!productValidityType) {
      throw new NotFoundException(`El producto "${quote.IdeProduct}" no tiene un tipo de vigencia configurado`);
    }

    const idePaymentFraction = await this.resolvePaymentFraction(quote.IdeProduct, dto.codPaymentFraction);
    const [ideContractInitial, numContract] = await Promise.all([
      this.stateMachine.getInitialState('TContract'),
      this.generateNumContract(),
    ]);

    const now = new Date();
    const tstInitial = dto.initialDate ? new Date(dto.initialDate) : now;
    const tstEnd = new Date(tstInitial);
    tstEnd.setFullYear(tstEnd.getFullYear() + 1); // ver comentario de cabecera: placeholder confirmado igual al original para tipos de vigencia no anuales.

    return this.prisma.tContract.create({
      data: {
        NumContract: numContract,
        IdeQuote: quote.IdeQuote,
        IdeProduct: quote.IdeProduct,
        IdeDistributionChannelSale: quote.IdeDistributionChannel,
        TstInitial: tstInitial,
        TstEnd: tstEnd,
        TstSubscription: now,
        IndCollective: false, // ver comentario de cabecera: colectivos reales quedan para una fase futura.
        IdeValidityType: productValidityType.IdeValidityType,
        ContractAge: 0, // TODO: fórmula real de ContractAge no confirmada contra el código fuente en esta ronda.
        IndInternalBillingManagement: true,
        IdePaymentFraction: idePaymentFraction,
        IdeState: ideContractInitial,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }

  /**
   * Genera `NumContract` con una secuencia real de Postgres, mismo
   * criterio explícito que `QuotesService.generateNumQuote` (ver
   * `packages/database/scripts/setup-contract-number-sequence.js`): el
   * original (`FContract('GETNUMBER', ...)`) tiene el mismo riesgo real de
   * colisión bajo concurrencia que tenía `FQuote('GETQUOTENUMBER', ...)`.
   * A diferencia de `NumQuote` (que lleva el `CodProduct` como prefijo
   * visible), el formato real de `NumContract` no se confirmó carácter por
   * carácter contra el código fuente en esta ronda -- se usa un formato
   * `CONT-<Año>-<N>` razonable y estable, documentado como decisión de
   * esta implementación (no una réplica literal del formato original).
   */
  private async generateNumContract(): Promise<string> {
    const result = await this.prisma.$queryRaw<{ nextval: number }[]>`
      SELECT nextval('ars_platform."SeqTContractNumber"')::int AS nextval
    `;
    const year = new Date().getFullYear();
    return `CONT-${year}-${result[0].nextval}`;
  }

  private async resolvePaymentFraction(ideProduct: string, codPaymentFraction?: string): Promise<string> {
    if (codPaymentFraction) {
      const row = await this.prisma.sProductPaymentFraction.findFirst({
        where: { IdeProduct: ideProduct, SPaymentFraction: { CodPaymentFraction: codPaymentFraction } },
        select: { IdePaymentFraction: true },
      });
      if (!row) {
        throw new NotFoundException(
          `El producto "${ideProduct}" no tiene configurada la fracción de pago "${codPaymentFraction}"`,
        );
      }
      return row.IdePaymentFraction;
    }

    const productFractions = await this.prisma.sProductPaymentFraction.findMany({
      where: { IdeProduct: ideProduct },
      include: { SPaymentFraction: { select: { NumOrder: true } } },
    });
    if (productFractions.length === 0) {
      throw new NotFoundException(`El producto "${ideProduct}" no tiene ninguna fracción de pago configurada`);
    }
    const defaultFraction = productFractions.sort(
      (a, b) => a.SPaymentFraction.NumOrder - b.SPaymentFraction.NumOrder,
    )[0];
    return defaultFraction.IdePaymentFraction;
  }

  /**
   * Equivalente a `FContractPerson('SETQUOTE', ...)`: copia las personas
   * de la cotización (`TQuotePerson`) con rol TOMADOR o TITULAR a
   * `TContractPerson`, y recién en ese momento marca
   * `TPerson.IndClient=true` + `TstRelationshipStart=now()` -- confirmado
   * contra el código real en la investigación de party-service (ver
   * docs/02-roadmap.md, `services/party-service/README.md`): "el momento
   * exacto en que un prospecto se convierte en cliente... es al crear el
   * contrato, no al cotizar". Roles distintos de TOMADOR/TITULAR
   * (BENEFICIARIO/ASEGURADO) NO se copian acá a nivel de contrato -- esos
   * son responsabilidad de `TFileRiskPerson`/`TContractFilePerson` a nivel
   * de riesgo/archivo, no de `TContractPerson`.
   */
  private async setContractPersons(ideQuote: string, ideContract: string, actor: string): Promise<void> {
    const quotePersons = await this.prisma.tQuotePerson.findMany({
      where: { IdeQuote: ideQuote, SPersonRol: { CodPersonRol: { in: ['TOMADOR', 'TITULAR'] } } },
    });
    if (quotePersons.length === 0) return;

    const ideContractPersonInitial = await this.stateMachine.getInitialState('TContractPerson');
    const now = new Date();

    for (const quotePerson of quotePersons) {
      await this.prisma.tContractPerson.create({
        data: {
          IdeContract: ideContract,
          IdePerson: quotePerson.IdePerson,
          IdePersonRol: quotePerson.IdePersonRol,
          ObjCustomData: quotePerson.ObjCustomData,
          IdeState: ideContractPersonInitial,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });
      await this.prisma.tPerson.update({
        where: { IdePerson: quotePerson.IdePerson },
        data: { IndClient: true, TstRelationshipStart: now, UsrModification: actor, TstModification: now },
      });
    }
  }

  /**
   * Equivalente a `FContractDistributionChannel`: un único canal principal
   * (`IndMain=true`, 100%), copiado del canal de origen de la cotización
   * (`TQuote.IdeDistributionChannel`) -- el original soporta un árbol de
   * comisiones/canales más complejo (`SCommissionProduct`, canal
   * origen/destino) que todavía no se investigó a fondo; se replica acá
   * solo el caso simple de un canal único, documentado como simplificación
   * deliberada.
   */
  private async setContractDistributionChannel(
    ideDistributionChannel: string,
    contract: { IdeContract: string; TstInitial: Date; TstEnd: Date | null },
    actor: string,
  ): Promise<void> {
    const ideStateInitial = await this.stateMachine.getInitialState('TContractDistributionChannel');
    const now = new Date();
    await this.prisma.tContractDistributionChannel.create({
      data: {
        IdeContract: contract.IdeContract,
        IdeDistributionChannel: ideDistributionChannel,
        Percentaje: 100,
        IndMain: true,
        TstInitial: contract.TstInitial,
        TstEnd: contract.TstEnd ?? contract.TstInitial,
        NumMovement: 1,
        IdeState: ideStateInitial,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }

  /**
   * Equivalente a `FContractBilling('SET', ...)`: divide la vigencia del
   * contrato en tantos períodos como indique `SPaymentFraction.NumFraction`
   * de la fracción de pago elegida (ej. 12 para mensual, 1 para anual),
   * en partes iguales. El original también tiene una operación `'BILL'`
   * separada cuyo efecto exacto sobre `TContractBilling` (que no tiene
   * columna de "facturado") no se re-confirmó contra el código fuente en
   * esta ronda -- se omite acá, los períodos se crean directamente en su
   * estado inicial.
   */
  private async setContractBilling(
    contract: { IdeContract: string; TstInitial: Date; TstEnd: Date | null; IdePaymentFraction: string },
    actor: string,
  ): Promise<void> {
    const paymentFraction = await this.prisma.sPaymentFraction.findUniqueOrThrow({
      where: { IdePaymentFraction: contract.IdePaymentFraction },
    });
    const ideStateInitial = await this.stateMachine.getInitialState('TContractBilling');
    const now = new Date();

    const start = contract.TstInitial.getTime();
    const end = (contract.TstEnd ?? contract.TstInitial).getTime();
    const numFraction = Math.max(paymentFraction.NumFraction, 1);
    const periodMs = (end - start) / numFraction;

    const periods = Array.from({ length: numFraction }, (_, index) => ({
      IdeContract: contract.IdeContract,
      NumPeriod: index + 1,
      TstInitial: new Date(start + periodMs * index),
      TstEnd: new Date(start + periodMs * (index + 1)),
      IdeState: ideStateInitial,
      UsrCreation: actor,
      TstCreation: now,
      UsrModification: actor,
      TstModification: now,
    }));
    await this.prisma.tContractBilling.createMany({ data: periods });
  }

  /**
   * Equivalente a `FContractFile`: en esta pasada siempre UN solo archivo
   * (`NumContractFile=1`) por contrato -- ver el comentario de cabecera de
   * la clase sobre contratos colectivos reales, deliberadamente fuera de
   * alcance.
   */
  private async createContractFile(
    contract: { IdeContract: string; TstInitial: Date; TstEnd: Date | null },
    actor: string,
  ) {
    const ideStateInitial = await this.stateMachine.getInitialState('TContractFile');
    const now = new Date();
    return this.prisma.tContractFile.create({
      data: {
        IdeContract: contract.IdeContract,
        NumContractFile: 1,
        TstInclusion: now,
        TstInitial: contract.TstInitial,
        TstEnd: contract.TstEnd ?? contract.TstInitial,
        IdeState: ideStateInitial,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }

  /**
   * Equivalente a `FContractOperation`: la operación inicial de generación
   * de contrato (`SOperation.CodOperation = 'CONTGENE'`, confirmado contra
   * el código real -- ver `packages/database/scripts/investigate-contract-engine.js`).
   */
  private async createInitialContractOperation(ideContract: string, actor: string) {
    const contract = await this.prisma.tContract.findUniqueOrThrow({ where: { IdeContract: ideContract } });
    const operationProduct = await this.prisma.sOperationProduct.findFirst({
      where: { IdeProduct: contract.IdeProduct, SOperation: { CodOperation: 'CONTGENE' } },
    });
    if (!operationProduct) {
      throw new NotFoundException(
        `El producto "${contract.IdeProduct}" no tiene configurada la operación "CONTGENE"`,
      );
    }
    const ideStateInitial = await this.stateMachine.getInitialState('TContractOperation');
    const now = new Date();
    return this.prisma.tContractOperation.create({
      data: {
        IdeContract: ideContract,
        IdeOperationProduct: operationProduct.IdeOperationProduct,
        NumOperation: 1,
        TstRequest: now,
        IdeState: ideStateInitial,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }

  /**
   * Equivalente a `FFileRisk` + `FRiskCoverage` + las copias de
   * `TContractRequirement`: por cada `TQuoteRisk` con un plan seleccionado
   * (`TQuoteRiskPlan.IndSelected=true`, confirmado contra el código real de
   * `FFileRisk`), crea el `TFileRisk` correspondiente; por cada
   * `TQuoteCoverage` seleccionada de ese plan, crea el `TRiskCoverage`
   * correspondiente (copiando Amount/Rate/Prime tal cual quedaron en la
   * cotización) y copia los `TQuoteRequirement` asociados (a nivel de
   * riesgo y de cobertura) a `TContractRequirement`.
   */
  private async copyRisksAndCoverages(
    ideQuote: string,
    ideProduct: string,
    ideContractFile: string,
    actor: string,
  ) {
    const quoteRisks = await this.prisma.tQuoteRisk.findMany({
      where: { IdeQuote: ideQuote },
      include: {
        TQuoteRiskPlan: {
          where: { IndSelected: true },
          include: { TQuoteCoverage: { where: { IndSelected: true } } },
        },
        TQuoteRequirement: true,
      },
    });

    const [ideFileRiskInitial, ideRiskCoverageInitial, ideContractRequirementInitial] = await Promise.all([
      this.stateMachine.getInitialState('TFileRisk'),
      this.stateMachine.getInitialState('TRiskCoverage'),
      this.stateMachine.getInitialState('TContractRequirement'),
    ]);
    const now = new Date();
    const contractFile = await this.prisma.tContractFile.findUniqueOrThrow({
      where: { IdeContractFile: ideContractFile },
    });

    const riskCoverages: {
      ideRiskCoverage: string;
      ideFileRisk: string;
      ideCoveragePlan: string;
      idePlanProductRisk: string;
      ideProduct: string;
      prime: number;
    }[] = [];

    let numFileRisk = 0;
    for (const quoteRisk of quoteRisks) {
      const selectedPlan = quoteRisk.TQuoteRiskPlan[0];
      if (!selectedPlan) continue; // riesgo sin plan seleccionado: no se contrata (mismo criterio que FFileRisk real).
      numFileRisk += 1;

      const fileRisk = await this.prisma.tFileRisk.create({
        data: {
          IdeContractFile: ideContractFile,
          NumFileRisk: numFileRisk,
          IdeRiskProduct: quoteRisk.IdeRiskProduct,
          IdePlanProductRisk: selectedPlan.IdePlanProductRisk,
          RiskAttributeValue: quoteRisk.RiskAttributeValue ?? undefined,
          TstInclusion: now,
          TstInitial: contractFile.TstInitial,
          TstEnd: contractFile.TstEnd,
          IdeState: ideFileRiskInitial,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });

      for (const requirement of quoteRisk.TQuoteRequirement.filter((r) => !r.IdeQuoteCoverage)) {
        await this.prisma.tContractRequirement.create({
          data: {
            IdeFileRisk: fileRisk.IdeFileRisk,
            IdeProductRequirement: requirement.IdeProductRequirement,
            Data: requirement.Data ?? undefined,
            IdeState: ideContractRequirementInitial,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });
      }

      for (const coverage of selectedPlan.TQuoteCoverage) {
        const riskCoverage = await this.prisma.tRiskCoverage.create({
          data: {
            IdeFileRisk: fileRisk.IdeFileRisk,
            IdeCoveragePlan: coverage.IdeCoveragePlan,
            TstInitial: contractFile.TstInitial,
            TstEnd: contractFile.TstEnd,
            Amount: coverage.Amount,
            Rate: coverage.Rate,
            Prime: coverage.Prime,
            IdeState: ideRiskCoverageInitial,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });
        riskCoverages.push({
          ideRiskCoverage: riskCoverage.IdeRiskCoverage,
          ideFileRisk: fileRisk.IdeFileRisk,
          ideCoveragePlan: coverage.IdeCoveragePlan,
          idePlanProductRisk: selectedPlan.IdePlanProductRisk,
          ideProduct,
          prime: Number(coverage.Prime),
        });

        const coverageRequirements = quoteRisk.TQuoteRequirement.filter(
          (r) => r.IdeQuoteCoverage === coverage.IdeQuoteCoverage,
        );
        for (const requirement of coverageRequirements) {
          await this.prisma.tContractRequirement.create({
            data: {
              IdeFileRisk: fileRisk.IdeFileRisk,
              IdeRiskCoverage: riskCoverage.IdeRiskCoverage,
              IdeProductRequirement: requirement.IdeProductRequirement,
              Data: requirement.Data ?? undefined,
              IdeState: ideContractRequirementInitial,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            },
          });
        }
      }
    }

    if (riskCoverages.length === 0) {
      throw new BadRequestException(
        'La cotización no tiene ningún riesgo con un plan y al menos una cobertura seleccionados',
      );
    }
    return riskCoverages;
  }

  /**
   * Equivalente a `FCoverageMovement` + `FMovementConcept('SetRulePrime', ...)`:
   * por cada `TRiskCoverage` recién creado, un único movimiento inicial
   * (`NumCoverageMovement=1`) atado a la operación de generación del
   * contrato, con el mismo motor de reglas ya usado del lado de cotización
   * (`RulesEngineService.evaluateChain`, `origin: 'Contract'` -- confirmado
   * que no requiere cambios de código, ver el doc-comment de
   * `EvaluationContext` en `@ars-platform/shared-common`). `SetNetPrime`
   * queda deliberadamente afuera (ver comentario de cabecera de la clase).
   */
  private async createInitialMovements(
    riskCoverages: {
      ideRiskCoverage: string;
      ideFileRisk: string;
      ideCoveragePlan: string;
      idePlanProductRisk: string;
      ideProduct: string;
      prime: number;
    }[],
    ideContractOperation: string,
    actor: string,
  ): Promise<void> {
    const [ideMovementInitial, ideMovementConceptInitial, primaTotalConcept] = await Promise.all([
      this.stateMachine.getInitialState('TCoverageMovement'),
      this.stateMachine.getInitialState('TMovementConcept'),
      this.prisma.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' } }),
    ]);
    const now = new Date();

    for (const riskCoverage of riskCoverages) {
      const coverage = await this.prisma.tRiskCoverage.findUniqueOrThrow({
        where: { IdeRiskCoverage: riskCoverage.ideRiskCoverage },
      });
      const movement = await this.prisma.tCoverageMovement.create({
        data: {
          IdeRiskCoverage: riskCoverage.ideRiskCoverage,
          NumCoverageMovement: 1,
          TstInitial: coverage.TstInitial,
          TstEnd: coverage.TstEnd,
          Amount: coverage.Amount,
          Rate: coverage.Rate,
          Prime: 0,
          IdeContractOperation: ideContractOperation,
          IdeState: ideMovementInitial,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });

      const rules = await this.rulesEngine.getApplicableRules({
        ideProduct: riskCoverage.ideProduct,
        idePlanProductRisk: riskCoverage.idePlanProductRisk,
        ideCoveragePlan: riskCoverage.ideCoveragePlan,
      });
      const results = await this.rulesEngine.evaluateChain(rules, {
        origin: 'Contract',
        ideOriginRisk: riskCoverage.ideFileRisk,
        ideCoverageOrMovement: movement.IdeCoverageMovement,
      });

      for (const result of results) {
        if (result.columnName) continue; // TCoverageMovement no expone columnas dinámicas equivalentes a Amount/Rate/Prime de TQuoteCoverage para este flujo; se ignora, mismo criterio de "no adivinar" que el resto de la clase.
        await this.prisma.tMovementConcept.create({
          data: {
            IdeCoverageMovement: movement.IdeCoverageMovement,
            IdeConcept: result.ideConcept,
            ConceptValue: result.value,
            ConceptNetValue: result.value, // TODO: SetNetPrime no implementado (ver comentario de cabecera de la clase); por ahora neto = bruto.
            IdeState: ideMovementConceptInitial,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });
      }

      let prime = riskCoverage.prime;
      if (primaTotalConcept) {
        const primaTotalRow = await this.prisma.tMovementConcept.findFirst({
          where: { IdeCoverageMovement: movement.IdeCoverageMovement, IdeConcept: primaTotalConcept.IdeConcept },
        });
        prime = primaTotalRow ? round2(Number(primaTotalRow.ConceptValue)) : riskCoverage.prime;
      }
      await this.prisma.tCoverageMovement.update({
        where: { IdeCoverageMovement: movement.IdeCoverageMovement },
        data: { Prime: prime, UsrModification: actor, TstModification: new Date() },
      });
      riskCoverage.prime = prime;
    }
  }

  /**
   * Equivalente a `FReceipt('NewContract', ...)`: un recibo por archivo de
   * póliza, con un detalle por cada movimiento de cobertura generado.
   * `IdeInsuranceLine` de cada detalle sale de `SCoveragePlan -> SCoverage
   * -> IdeInsuranceLine` (único camino real en el esquema hacia ese campo).
   * `IdeReceiptType`: se resuelve por código (`codReceiptType`, por
   * defecto `'NEW'`) contra `SReceiptType` -- si el código real difiere,
   * esto falla explícitamente con `NotFoundException` en vez de guardar
   * datos incorrectos en silencio. El defecto real conocido de
   * `FReceipt` (`IdeReceiptType` determinado con una lógica que el propio
   * comentario del original marca como
   * `*******REVISAR ESTE PROCESO ESTA MALO*********`) NO aplica acá: en
   * esta primera pasada solo existe el caso "contrato nuevo", no hay
   * ambigüedad NEW/REN/SUP que resolver todavía.
   *
   * `Fee`: ver el comentario de cabecera de la clase -- se deja en 0,
   * cálculo de comisión deliberadamente fuera de esta pasada.
   */
  private async createInitialReceipt(
    contract: { IdeContract: string },
    contractFile: { IdeContractFile: string; TstInitial: Date; TstEnd: Date },
    contractOperation: { IdeContractOperation: string },
    riskCoverages: { ideRiskCoverage: string; ideCoveragePlan: string; prime: number }[],
    actor: string,
  ): Promise<void> {
    const ideReceiptType = await this.resolveReceiptType('NEW');
    const [ideReceiptInitial, ideReceiptDetailInitial] = await Promise.all([
      this.stateMachine.getInitialState('TReceipt'),
      this.stateMachine.getInitialState('TReceiptDetail'),
    ]);
    const now = new Date();

    const movements = await this.prisma.tCoverageMovement.findMany({
      where: { IdeRiskCoverage: { in: riskCoverages.map((r) => r.ideRiskCoverage) } },
    });
    const totalPrime = round2(movements.reduce((sum, movement) => sum + Number(movement.Prime), 0));

    const receipt = await this.prisma.tReceipt.create({
      data: {
        IdeContractFile: contractFile.IdeContractFile,
        IdeContractOperation: contractOperation.IdeContractOperation,
        IdeContract: contract.IdeContract,
        IdeReceiptType: ideReceiptType,
        NumReceipt: await this.generateNumReceipt(),
        TstIssue: now,
        TstInitial: contractFile.TstInitial,
        TstEnd: contractFile.TstEnd,
        Fee: 0, // TODO: fórmula real de comisión/fee no confirmada en esta ronda, ver comentario de cabecera de la clase.
        Prime: totalPrime,
        IdeState: ideReceiptInitial,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });

    const primaTotalConcept = await this.prisma.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' } });
    if (!primaTotalConcept) return;

    for (const riskCoverage of riskCoverages) {
      const movement = movements.find((m) => m.IdeRiskCoverage === riskCoverage.ideRiskCoverage);
      if (!movement) continue;
      const ideInsuranceLine = await this.resolveInsuranceLine(riskCoverage.ideCoveragePlan);
      await this.prisma.tReceiptDetail.create({
        data: {
          IdeReceipt: receipt.IdeReceipt,
          IdeCoverageMovement: movement.IdeCoverageMovement,
          IdeInsuranceLine: ideInsuranceLine,
          IdeConcept: primaTotalConcept.IdeConcept,
          ConceptValue: movement.Prime,
          IdeState: ideReceiptDetailInitial,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });
    }
  }

  private async resolveReceiptType(codReceiptType: string): Promise<string> {
    const row = await this.prisma.sReceiptType.findFirst({ where: { CodReceiptType: codReceiptType } });
    if (!row) {
      throw new NotFoundException(`No existe tipo de recibo con código "${codReceiptType}"`);
    }
    return row.IdeReceiptType;
  }

  private async resolveInsuranceLine(ideCoveragePlan: string): Promise<string> {
    const coveragePlan = await this.prisma.sCoveragePlan.findUniqueOrThrow({
      where: { IdeCoveragePlan: ideCoveragePlan },
      include: { SCoverage: { select: { IdeInsuranceLine: true } } },
    });
    return coveragePlan.SCoverage.IdeInsuranceLine;
  }

  /**
   * `NumReceipt` -- igual criterio de secuencia real (atómica, sin riesgo
   * de colisión) que `NumContract`/`NumQuote` (ver comentario de
   * `generateNumContract`), formato propio de esta implementación (no
   * confirmado carácter por carácter contra `FReceipt_GetNumber`).
   * Reutiliza deliberadamente `SeqTContractNumber` (comparte el pool
   * incremental con `NumContract`) en vez de crear una tercera secuencia
   * de Postgres solo para esto en esta primera pasada -- el prefijo
   * `REC-` sigue distinguiendo un recibo de un contrato aunque el número
   * de la derecha venga del mismo contador.
   */
  private async generateNumReceipt(): Promise<string> {
    const result = await this.prisma.$queryRaw<{ nextval: number }[]>`
      SELECT nextval('ars_platform."SeqTContractNumber"')::int AS nextval
    `;
    const year = new Date().getFullYear();
    return `REC-${year}-${result[0].nextval}`;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
