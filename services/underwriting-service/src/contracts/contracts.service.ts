import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import { RulesEngineService, StateMachineService } from '@ars-platform/shared-common';
import { QuotesService } from '../quoting/quotes.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { CancelContractDto } from './dto/cancel-contract.dto';

/**
 * Timeout de la transacción que envuelve `cancel()` -- generoso porque
 * `setCancelPrime` recorre día a día toda la vigencia del movimiento de
 * cierre (cientos de round-trips a Postgres para una vigencia anual,
 * confirmado ~1-2 minutos en la práctica contra un pooler remoto). Los
 * 5 segundos por defecto de Prisma no alcanzan ni de cerca.
 */
const CANCEL_TRANSACTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

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
 *  - `TMovementConcept`/`FMovementConcept('SetNetPrime', ...)`: se replica
 *    únicamente `SetRulePrime` (idéntico patrón ya confirmado y en
 *    producción del lado de `QuotesService.calculateQuoteCoverageConcepts`,
 *    reutilizando `RulesEngineService.evaluateChain` con `origin: 'Contract'`
 *    tal como confirma el doc-comment de `EvaluationContext`). El concepto
 *    de prima neta (`SetNetPrime`) queda pendiente de confirmar su código
 *    real de `SConcept` antes de replicarlo.
 *  - `ContractAge`: el valor INICIAL (`1`) para un contrato nuevo está
 *    confirmado literal contra el `INSERT` real de `TContract` en
 *    CONTRACTNEW (ver historial de investigación) y ya se persiste así.
 *    Lo que sigue sin confirmar es la fórmula de INCREMENTO en
 *    renovaciones -- no aplica todavía porque esta fase no implementa
 *    renovaciones.
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
    await this.setContractDistributionChannel(quote.IdeDistributionChannel, quote.IdeProduct, contract, actor);
    await this.setContractBilling(contract, actor);

    const contractFile = await this.createContractFile(contract, actor);
    await this.createInitialContractOperation(contract.IdeContract, actor);

    const riskCoverages = await this.copyRisksAndCoverages(
      quote.IdeQuote,
      contract.IdeProduct,
      contractFile.IdeContractFile,
      actor,
    );
    await this.createInitialMovements(riskCoverages, actor);
    await this.setNetPrime(contractFile.IdeContractFile, actor);
    await this.generateReceipts(contract.IdeContract, null, actor);

    await this.activateContractTree(contract.IdeContract, actor);
    await this.quotesService.transitionState(quote.IdeQuote, 'Contratar', actor);

    return this.findOne(contract.IdeContract);
  }

  /**
   * Cascada de anulación de contrato, equivalente a `FContract('CANCELCONTRACT', ...)`
   * -- confirmada línea por línea contra el código real (ver
   * `packages/database/scripts/investigate-contract-engine.js`, re-corrida
   * específicamente para esta cascada, más `find-legacy-function.js FFileRisk`
   * para el único hueco que la primera corrida no capturaba).
   *
   * ORDEN (idéntico al original): valida el contrato (`Activo`, fecha de
   * anulación dentro de su vigencia) y graba `TstCancellation`/`DesCancellation`
   * -> resuelve la operación de anulación por el endoso
   * (`SOperationProduct.IdeProductEndorsement`, distinto del `IdeProduct`
   * que usa `CONTGENE`) -> por cada `TContractFile` activo: cascada de
   * anulación hacia abajo (`TFileRisk` -> `TRiskCoverage`, cada una genera
   * su movimiento de cierre en 0 vía `FCoverageMovement`) -> conceptos de
   * cierre (`SetCancelConcept`, en 0) -> prorrateo día a día de la
   * devolución de prima/comisión/impuesto (`SetCancelPrime`, según
   * `SProductEndorsement.ConditionData`) -> `TContract` a `'Modificar'`
   * (transición intermedia, NO cascada completa) -> recibo(s) de la
   * anulación (`FReceipt`, misma rama que `NEWCONTRACT` -- reutiliza
   * `FContractOperation` con `'RECEGENE'`, re-apunta los movimientos en
   * Borrador, y por el defecto YA documentado en el original
   * (`*******REVISAR ESTE PROCESO ESTA MALO*********`) el tipo de recibo
   * siempre cae en `'SUP'` porque `NumOperation` ya es > 2 en este punto)
   * -> cascada final de estado a `'Anular'` en las 6 entidades del árbol
   * (`TContract` -> `TContractFile` -> `TFileRisk` -> `TRiskCoverage` ->
   * `TCoverageMovement` -> `TMovementConcept`, ver `applyStateCascade`).
   *
   * Requiere `SStateRule` configurada para los operativos `'Modificar'` y
   * `'Anular'` en las entidades del árbol (no venían en el seed original de
   * CONTRACTNEW, que solo tenía `'Activar'`) y un `SProductEndorsement`
   * real con `ConditionData.refundPremium/refundCommission/refundTax`.
   */
  async cancel(ideContract: string, dto: CancelContractDto, actor: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }

    const tstCancellation = new Date(dto.tstCancellation);

    // Toda la cascada corre en UNA transacción de Postgres: si cualquier
    // paso falla, se revierte TODO (contrato, certificado, riesgo,
    // cobertura, movimientos, conceptos, recibos) -- antes de esto, un
    // fallo a mitad de camino (confirmado en la práctica) dejaba el
    // contrato grabado en la BD real en un estado a medias, sin forma de
    // revertirlo automáticamente. `this.stateMachine`/`this.rulesEngine`
    // se dejan FUERA de la transacción a propósito: solo leen catálogo
    // (SEntity/SStateRule/SState/SCalculationRule/...) que esta cascada
    // nunca escribe, así que usar la conexión no transaccional para esas
    // lecturas es seguro y no compromete la atomicidad de las escrituras.
    await this.prisma.$transaction(
      async (tx) => {
        const contract = await this.markContractCancellation(
          ideContract,
          tstCancellation,
          dto.desCancellation,
          actor,
          tx,
        );

        const codOperation = await this.resolveOperationCodeByEndorsement(dto.ideProductEndorsement, tx);
        await this.createContractOperation(ideContract, contract.IdeProduct, codOperation, actor, tx);

        const ideActivo = await this.stateMachine.getStateByCode('Activo');
        const files = await tx.tContractFile.findMany({
          where: { IdeContract: ideContract, IdeState: ideActivo },
          select: { IdeContractFile: true },
        });
        for (const file of files) {
          await this.cancelContractFile(ideContract, file.IdeContractFile, actor, tx);
          await this.setCancelConcept(file.IdeContractFile, actor, tx);
          await this.setCancelPrime(file.IdeContractFile, dto.ideProductEndorsement, actor, tx);
        }

        const nextContractState = await this.stateMachine.getNextState('TContract', contract.IdeState, 'Modificar');
        await tx.tContract.update({
          where: { IdeContract: ideContract },
          data: { IdeState: nextContractState, UsrModification: actor, TstModification: new Date() },
        });

        await this.generateReceipts(ideContract, dto.ideProductEndorsement, actor, tx);
        await this.applyStateCascade(ideContract, 'Anular', actor, tx);
      },
      { timeout: CANCEL_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    return this.findOne(ideContract);
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

  private async applyStateCascade(
    ideContract: string,
    codOperative: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const now = new Date();
    const contract = await tx.tContract.findUniqueOrThrow({ where: { IdeContract: ideContract } });
    const nextContractState = await this.stateMachine.getNextState('TContract', contract.IdeState, codOperative);
    await tx.tContract.update({
      where: { IdeContract: ideContract },
      data: { IdeState: nextContractState, UsrModification: actor, TstModification: now },
    });

    const files = await tx.tContractFile.findMany({ where: { IdeContract: ideContract } });
    for (const file of files) {
      const nextFileState = await this.stateMachine.getNextState('TContractFile', file.IdeState, codOperative);
      await tx.tContractFile.update({
        where: { IdeContractFile: file.IdeContractFile },
        data: { IdeState: nextFileState, UsrModification: actor, TstModification: now },
      });

      const fileRisks = await tx.tFileRisk.findMany({ where: { IdeContractFile: file.IdeContractFile } });
      for (const fileRisk of fileRisks) {
        const nextFileRiskState = await this.stateMachine.getNextState('TFileRisk', fileRisk.IdeState, codOperative);
        await tx.tFileRisk.update({
          where: { IdeFileRisk: fileRisk.IdeFileRisk },
          data: { IdeState: nextFileRiskState, UsrModification: actor, TstModification: now },
        });

        const riskCoverages = await tx.tRiskCoverage.findMany({
          where: { IdeFileRisk: fileRisk.IdeFileRisk },
        });
        for (const riskCoverage of riskCoverages) {
          const nextCoverageState = await this.stateMachine.getNextState(
            'TRiskCoverage',
            riskCoverage.IdeState,
            codOperative,
          );
          await tx.tRiskCoverage.update({
            where: { IdeRiskCoverage: riskCoverage.IdeRiskCoverage },
            data: { IdeState: nextCoverageState, UsrModification: actor, TstModification: now },
          });

          const movements = await tx.tCoverageMovement.findMany({
            where: { IdeRiskCoverage: riskCoverage.IdeRiskCoverage },
          });
          for (const movement of movements) {
            const nextMovementState = await this.stateMachine.getNextState(
              'TCoverageMovement',
              movement.IdeState,
              codOperative,
            );
            await tx.tCoverageMovement.update({
              where: { IdeCoverageMovement: movement.IdeCoverageMovement },
              data: { IdeState: nextMovementState, UsrModification: actor, TstModification: now },
            });

            // Confirmado contra el `FContract('SETSTATE', ...)` real (ver
            // investigate-contract-engine.js): la cascada de estado baja UN
            // nivel más, hasta `TMovementConcept` -- nivel que el primer
            // pase de esta clase (solo probado contra la transición
            // "Activar" de CONTRACTNEW) no ejercitaba y por eso no se había
            // notado que faltaba.
            const movementConcepts = await tx.tMovementConcept.findMany({
              where: { IdeCoverageMovement: movement.IdeCoverageMovement },
            });
            for (const movementConcept of movementConcepts) {
              const nextConceptState = await this.stateMachine.getNextState(
                'TMovementConcept',
                movementConcept.IdeState,
                codOperative,
              );
              await tx.tMovementConcept.update({
                where: { IdeMovementConcept: movementConcept.IdeMovementConcept },
                data: { IdeState: nextConceptState, UsrModification: actor, TstModification: now },
              });
            }
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
        ContractAge: 1, // Confirmado literal contra el INSERT real de TContract en CONTRACTNEW -- ver doc-comment de cabecera de la clase.
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
   * Equivalente a `FContractDistributionChannel('SETQUOTE', ...)`,
   * confirmado línea por línea contra el código fuente real (idéntico en
   * las 3 copias del esquema): si existe configuración de split en
   * `SCommissionProduct` para (canal de origen de la cotización,
   * producto), se crea un `TContractDistributionChannel` por CADA fila
   * `Activa` que matchee -- con el canal destino, `Percentaje` e
   * `IndMain` de esa fila. El original NO filtra acá por vigencia ni por
   * `NumMovement` (a diferencia de `SCommission`/
   * `resolveCommissionPercentage`, que sí lo hacen) -- toma todas las
   * filas activas tal cual, confirmado literal. Si NO existe ninguna
   * configuración, se replica el fallback real: un único canal (el de la
   * cotización), `Percentaje=100`, `IndMain=true`. `NumMovement` es
   * siempre `1` en ambos casos (literal del `INSERT` real, no un
   * correlativo que incremente).
   *
   * `SCommissionProduct` no tiene función PL/pgSQL propia de escritura
   * (confirmado, ver `services/party-service/README.md`) y su CRUD
   * (`party-service`) actualiza en el lugar sin versionado -- si
   * permitiera dejar dos filas Activas para el mismo (producto, canal
   * origen, canal destino) a la vez, este método las tomaría a ambas y
   * duplicaría el split (decisión explícita del usuario, ver
   * `docs/02-roadmap.md`).
   */
  private async setContractDistributionChannel(
    ideDistributionChannel: string,
    ideProduct: string,
    contract: { IdeContract: string; TstInitial: Date; TstEnd: Date | null },
    actor: string,
  ): Promise<void> {
    const ideStateInitial = await this.stateMachine.getInitialState('TContractDistributionChannel');
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const tstEnd = contract.TstEnd ?? contract.TstInitial;

    const splitConfig = await this.prisma.sCommissionProduct.findMany({
      where: {
        IdeDistributionChannelOrigin: ideDistributionChannel,
        IdeProduct: ideProduct,
        IdeState: ideActivo,
      },
    });

    const channelsToCreate =
      splitConfig.length > 0
        ? splitConfig.map((config) => ({
            IdeDistributionChannel: config.IdeDistributionChannelDestiny,
            Percentaje: config.Percentaje,
            IndMain: config.IndMain,
          }))
        : [{ IdeDistributionChannel: ideDistributionChannel, Percentaje: new Prisma.Decimal(100), IndMain: true }];

    for (const channel of channelsToCreate) {
      await this.prisma.tContractDistributionChannel.create({
        data: {
          IdeContract: contract.IdeContract,
          IdeDistributionChannel: channel.IdeDistributionChannel,
          Percentaje: channel.Percentaje,
          IndMain: channel.IndMain,
          TstInitial: contract.TstInitial,
          TstEnd: tstEnd,
          NumMovement: 1,
          IdeState: ideStateInitial,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });
    }
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
   * Delega en `createContractOperation` (genérico, ver más abajo -- agregado
   * al confirmar la cascada de anulación, que reutiliza exactamente el mismo
   * `FContractOperation` con otros códigos: la operación de anulación
   * resuelta por endoso y `RECEGENE` para el recibo).
   */
  private async createInitialContractOperation(ideContract: string, actor: string) {
    const contract = await this.prisma.tContract.findUniqueOrThrow({ where: { IdeContract: ideContract } });
    return this.createContractOperation(ideContract, contract.IdeProduct, 'CONTGENE', actor);
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
   * `EvaluationContext` en `@ars-platform/shared-common`). `ConceptNetValue`
   * queda acá igual al bruto como valor provisorio -- `setNetPrime` (llamado
   * después, ver `create()`) lo recalcula de verdad.
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
          // IdeContractOperation queda NULL a propósito -- confirmado contra
          // el `FCoverageMovement` real (caso SETQUOTE): no fija la operación
          // acá. `generateReceipts` la re-apunta a la operación RECEGENE que
          // crea, igual que hace con los movimientos de cierre de `cancel()`.
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
            ConceptNetValue: result.value, // Provisorio -- `setNetPrime` lo recalcula después (ver `create()`).
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
   * Equivalente a `FMovementConcept('SetNetPrime', ...)`, confirmado línea
   * por línea contra el código fuente real (idéntico en las 3 copias del
   * esquema): calcula/actualiza `TMovementConcept.ConceptNetValue` de los
   * movimientos en Borrador (`IdeContractOperation IS NULL`) de cada
   * `TRiskCoverage` del `TContractFile`, y recalcula
   * `TCoverageMovement.Prime`/`TRiskCoverage.Prime` a partir de eso.
   *
   * El original resuelve `PorSurCharge`/`NumFraction`/`IndProportionalPrime`
   * con un único `SELECT ... INTO` que hace join entre `TContractFile`,
   * `TContract`, `SProductPaymentFraction` (vigente, Activo),
   * `SPaymentFraction` (Activo) y `SProduct` (vigente, Activo) -- si ese
   * join no matchea (falta configuración), TODAS esas variables quedan
   * NULL y la función completa termina sin hacer nada (comportamiento real
   * de un `SELECT INTO` sin `STRICT`, no una omisión de esta
   * implementación) -- se replica devolviendo temprano.
   *
   * Por cada `TCoverageMovement` en Borrador, busca el movimiento INMEDIATO
   * ANTERIOR (`NumCoverageMovement - 1`) de la misma cobertura:
   *  - Si NO existe (movimiento inicial): `ConceptNetValue` de TODOS sus
   *    conceptos se fija con la misma fórmula (proporcional según fracción
   *    de pago + recargo, o por días exactos del período de facturación
   *    vigente según `SProduct.IndProportionalPrime`) -- sin `round()`,
   *    literal del original. Es el único caso que se ejercita hoy
   *    (`create()` solo genera un movimiento inicial por cobertura); el
   *    resto queda listo para cuando `FReceipt('BILLFRACTION')` (ítem
   *    pendiente separado del roadmap) empiece a crear movimientos
   *    subsiguientes.
   *  - Si SÍ existe: por cada concepto del movimiento nuevo, si su ventana
   *    cae DENTRO de la del anterior, `ConceptNetValue` = la diferencia
   *    (redondeada a 2 decimales) entre el valor bruto nuevo y el valor
   *    NETO anterior, cada uno prorrateado a los días del movimiento nuevo
   *    (con el `+1 segundo` real que hace el conteo inclusivo); si en
   *    cambio arranca justo donde terminó el anterior y cae dentro del
   *    período de facturación vigente, se recalcula con la misma fórmula
   *    proporcional/por-días de arriba (esta vez sí redondeada). Cualquier
   *    otro escenario queda sin tocar -- el original no tiene un `ELSE` acá
   *    (comentario propio "Incluir posteriormente otros escenarios de
   *    cálculo"), confirmado como un hueco real, no algo a inventar.
   *
   * Al terminar cada movimiento, `TCoverageMovement.Prime` = el
   * `ConceptNetValue` (redondeado) del concepto `PrimaTotal` de ESE
   * movimiento. Al terminar cada cobertura, `TRiskCoverage.Prime` = el
   * `ConceptValue` (bruto, NO neto -- confirmado literal, mismo patrón ya
   * visto en `setCancelPrime`/`setCancelConcept`) del concepto `PrimaTotal`
   * del ÚLTIMO movimiento procesado de esa cobertura.
   *
   * Riesgo a vigilar en la primera prueba end-to-end: si `TContractBilling`
   * no nace en el estado que este método filtra como vigente (`Activo`,
   * igual criterio que `resolveMainDistributionChannel`), el período de
   * facturación activo no se encuentra -- mismo tipo de bug de fixture ya
   * encontrado y corregido antes para `TContractDistributionChannel`. No
   * afecta al caso proporcional (`IndProportionalPrime=true`, default del
   * esquema), que no depende de `TContractBilling`.
   */
  private async setNetPrime(
    ideContractFile: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const contractFile = await tx.tContractFile.findUniqueOrThrow({
      where: { IdeContractFile: ideContractFile },
      select: { TstInitial: true, TstEnd: true, IdeContract: true },
    });
    const contract = await tx.tContract.findUniqueOrThrow({
      where: { IdeContract: contractFile.IdeContract },
      select: { IdeProduct: true, IdePaymentFraction: true },
    });
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();

    const productPaymentFraction = await tx.sProductPaymentFraction.findFirst({
      where: {
        IdeProduct: contract.IdeProduct,
        IdePaymentFraction: contract.IdePaymentFraction,
        TstInitial: { lte: now },
        TstEnd: { gte: now },
        IdeState: ideActivo,
      },
    });
    const paymentFraction = productPaymentFraction
      ? await tx.sPaymentFraction.findFirst({
          where: { IdePaymentFraction: productPaymentFraction.IdePaymentFraction, IdeState: ideActivo },
        })
      : null;
    const product = await tx.sProduct.findFirst({
      where: {
        IdeProduct: contract.IdeProduct,
        TstInitial: { lte: now },
        TstEnd: { gte: now },
        IdeState: ideActivo,
      },
    });

    // Join real sin STRICT: si falta cualquiera de las 3 configuraciones, no se hace nada.
    if (!productPaymentFraction || !paymentFraction || !product) {
      return;
    }

    const numDiasContract = daysBetween(contractFile.TstInitial, contractFile.TstEnd);
    const porSurcharge = Number(productPaymentFraction.PorSurCharge);
    const numFraction = paymentFraction.NumFraction;
    const indProportionalPrime = product.IndProportionalPrime;

    const activeBilling = await tx.tContractBilling.findFirst({
      where: { IdeContract: contractFile.IdeContract, IdeState: ideActivo },
    });
    const numDiasPeriodo = activeBilling ? daysBetween(activeBilling.TstInitial, activeBilling.TstEnd) : NaN;

    const primaTotalConcept = await tx.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' } });
    const riskCoverages = await tx.tRiskCoverage.findMany({
      where: { TFileRisk: { IdeContractFile: ideContractFile } },
      select: { IdeRiskCoverage: true },
    });

    for (const { IdeRiskCoverage: ideRiskCoverage } of riskCoverages) {
      const movements = await tx.tCoverageMovement.findMany({
        where: { IdeRiskCoverage: ideRiskCoverage, IdeContractOperation: null },
        orderBy: { NumCoverageMovement: 'asc' },
      });
      let lastProcessed: string | null = null;

      for (const movement of movements) {
        const oldMovement = await tx.tCoverageMovement.findFirst({
          where: { IdeRiskCoverage: ideRiskCoverage, NumCoverageMovement: movement.NumCoverageMovement - 1 },
        });
        const newConcepts = await tx.tMovementConcept.findMany({
          where: { IdeCoverageMovement: movement.IdeCoverageMovement },
        });

        if (!oldMovement) {
          // Movimiento inicial: misma fórmula para TODOS sus conceptos, sin redondear (literal del original).
          for (const concept of newConcepts) {
            const grossValue = Number(concept.ConceptValue);
            const netValue = indProportionalPrime
              ? grossValue / numFraction + (grossValue / numFraction) * (porSurcharge / 100)
              : (grossValue / numDiasContract) * numDiasPeriodo +
                ((grossValue / numDiasContract) * numDiasPeriodo) * (porSurcharge / 100);
            await tx.tMovementConcept.update({
              where: { IdeMovementConcept: concept.IdeMovementConcept },
              data: { ConceptNetValue: netValue, UsrModification: actor, TstModification: now },
            });
          }
        } else {
          // +1 segundo real (conteo inclusivo), ver doc-comment.
          const cantDias = Math.floor(
            (movement.TstEnd.getTime() - movement.TstInitial.getTime() + 1000) / 86_400_000,
          );
          for (const newConcept of newConcepts) {
            const withinOldWindow =
              movement.TstInitial.getTime() >= oldMovement.TstInitial.getTime() &&
              movement.TstEnd.getTime() <= oldMovement.TstEnd.getTime();
            const followsIntoActivePeriod =
              movement.TstInitial.getTime() >= oldMovement.TstEnd.getTime() &&
              activeBilling !== null &&
              movement.TstEnd.getTime() <= activeBilling.TstEnd.getTime();

            if (withinOldWindow) {
              const oldConcept = await tx.tMovementConcept.findFirst({
                where: { IdeCoverageMovement: oldMovement.IdeCoverageMovement, IdeConcept: newConcept.IdeConcept },
              });
              if (!oldConcept) continue;
              const netValue = round2(
                (Number(newConcept.ConceptValue) / numDiasContract) * cantDias -
                  (Number(oldConcept.ConceptValue) / numDiasContract) * cantDias,
              );
              await tx.tMovementConcept.update({
                where: { IdeMovementConcept: newConcept.IdeMovementConcept },
                data: { ConceptNetValue: netValue, UsrModification: actor, TstModification: now },
              });
            } else if (followsIntoActivePeriod) {
              const grossValue = Number(newConcept.ConceptValue);
              const netValue = indProportionalPrime
                ? round2(grossValue / numFraction + (grossValue / numFraction) * (porSurcharge / 100))
                : round2(
                    (grossValue / numDiasContract) * numDiasPeriodo +
                      ((grossValue / numDiasContract) * numDiasPeriodo) * (porSurcharge / 100),
                  );
              await tx.tMovementConcept.update({
                where: { IdeMovementConcept: newConcept.IdeMovementConcept },
                data: { ConceptNetValue: netValue, UsrModification: actor, TstModification: now },
              });
            }
            // Cualquier otro escenario: sin tocar (hueco real del original).
          }
        }

        if (primaTotalConcept) {
          const primaTotalRow = await tx.tMovementConcept.findFirst({
            where: { IdeCoverageMovement: movement.IdeCoverageMovement, IdeConcept: primaTotalConcept.IdeConcept },
          });
          const primeNet = primaTotalRow ? round2(Number(primaTotalRow.ConceptNetValue)) : 0;
          await tx.tCoverageMovement.update({
            where: { IdeCoverageMovement: movement.IdeCoverageMovement },
            data: { Prime: primeNet, UsrModification: actor, TstModification: now },
          });
        }
        lastProcessed = movement.IdeCoverageMovement;
      }

      if (lastProcessed && primaTotalConcept) {
        const primaTotalRow = await tx.tMovementConcept.findFirst({
          where: { IdeCoverageMovement: lastProcessed, IdeConcept: primaTotalConcept.IdeConcept },
        });
        const primeGross = primaTotalRow ? round2(Number(primaTotalRow.ConceptValue)) : 0;
        await tx.tRiskCoverage.update({
          where: { IdeRiskCoverage: ideRiskCoverage },
          data: { Prime: primeGross, UsrModification: actor, TstModification: now },
        });
      }
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
   * `NumReceipt` -- formato alineado al real de `FReceipt_GetNumber`
   * ('Rec'||CodProduct||'-'||Año||'-'||secuencia, confirmado contra el
   * código fuente en `packages/database/scripts/investigate-contract-engine.js`),
   * pero con la secuencia resuelta vía una secuencia real de Postgres
   * (`SeqTContractNumber`, compartida con `NumContract`) en vez del
   * escaneo `split_part(NumReceipt,'-',3)` del original -- ese escaneo
   * tiene el mismo riesgo real de colisión bajo concurrencia que ya se
   * evitó para `NumQuote`/`NumContract` (ver `generateNumContract`), y
   * acá se evita de la misma forma sin cambiar el formato visible.
   */
  private async generateNumReceipt(ideProduct: string): Promise<string> {
    const product = await this.prisma.sProduct.findUniqueOrThrow({
      where: { IdeProduct: ideProduct },
      select: { CodProduct: true },
    });
    const result = await this.prisma.$queryRaw<{ nextval: number }[]>`
      SELECT nextval('ars_platform."SeqTContractNumber"')::int AS nextval
    `;
    const year = new Date().getFullYear();
    return `Rec${product.CodProduct}-${year}-${result[0].nextval}`;
  }

  // ==========================================================================
  // Cascada de anulación de contrato -- equivalente a `FContract('CANCELCONTRACT', ...)`
  // (ver el método público `cancel` más arriba para el doc-comment de orden completo)
  // ==========================================================================

  /**
   * Primer paso de `FContract('CANCELCONTRACT', ...)`: valida que el
   * contrato esté `Activo` y que la fecha de anulación caiga dentro de su
   * vigencia (`TstInitial`/`TstEnd`), y graba `TstCancellation`/`DesCancellation`
   * -- el `IdeState` del contrato NO cambia acá todavía (sigue `Activo`
   * hasta el paso "TContract a Modificar" más adelante en la cascada,
   * confirmado contra el código real).
   */
  private async markContractCancellation(
    ideContract: string,
    tstCancellation: Date,
    desCancellation: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const contract = await tx.tContract.findFirst({
      where: {
        IdeContract: ideContract,
        IdeState: ideActivo,
        TstInitial: { lte: tstCancellation },
        TstEnd: { gte: tstCancellation },
      },
    });
    if (!contract) {
      throw new ConflictException(
        'No se pudo procesar la anulación: el contrato no está en estado "Activo" o la fecha de anulación no está dentro de su vigencia',
      );
    }
    const now = new Date();
    return tx.tContract.update({
      where: { IdeContract: ideContract },
      data: {
        TstCancellation: tstCancellation,
        DesCancellation: desCancellation,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }

  /**
   * Resuelve `vCodOperation` en el `FContract` real: la operación
   * configurada para el endoso de anulación, vía
   * `SOperationProduct.IdeProductEndorsement` (join distinto del que usa
   * `CONTGENE`/`RECEGENE`, que van por `IdeProduct` -- ver comentario de
   * `createContractOperation`).
   */
  private async resolveOperationCodeByEndorsement(
    ideProductEndorsement: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    const operationProduct = await tx.sOperationProduct.findFirst({
      where: { IdeProductEndorsement: ideProductEndorsement },
      include: { SOperation: { select: { CodOperation: true } } },
    });
    if (!operationProduct) {
      throw new NotFoundException(
        `El endoso "${ideProductEndorsement}" no tiene una operación configurada (SOperationProduct.IdeProductEndorsement)`,
      );
    }
    return operationProduct.SOperation.CodOperation;
  }

  /**
   * Equivalente genérico a `FContractOperation`: busca `SOperationProduct`
   * por `IdeProduct` + `SOperation.CodOperation` (mismo join que el
   * original, confirmado contra su código fuente) y crea la fila de
   * `TContractOperation` con `NumOperation` = máximo existente del
   * contrato + 1 (1 si es la primera). Reutilizada por la generación
   * inicial (`CONTGENE`, vía `createInitialContractOperation`), por la
   * operación de anulación (código resuelto por endoso) y por la
   * generación de recibos (`RECEGENE`, ver `generateReceipts`).
   */
  private async createContractOperation(
    ideContract: string,
    ideProduct: string,
    codOperation: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const operationProduct = await tx.sOperationProduct.findFirst({
      where: { IdeProduct: ideProduct, SOperation: { CodOperation: codOperation } },
    });
    if (!operationProduct) {
      throw new NotFoundException(`El producto "${ideProduct}" no tiene configurada la operación "${codOperation}"`);
    }
    const lastOperation = await tx.tContractOperation.findFirst({
      where: { IdeContract: ideContract },
      orderBy: { NumOperation: 'desc' },
      select: { NumOperation: true },
    });
    const numOperation = (lastOperation?.NumOperation ?? 0) + 1;
    const ideStateInitial = await this.stateMachine.getInitialState('TContractOperation');
    const now = new Date();
    return tx.tContractOperation.create({
      data: {
        IdeContract: ideContract,
        IdeOperationProduct: operationProduct.IdeOperationProduct,
        NumOperation: numOperation,
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
   * Equivalente a `FContractFile('CancelContract', ...)`: por cada
   * `TFileRisk` activo y dentro de la ventana de anulación de este
   * `TContractFile` (también activo y en ventana), cascada hacia
   * `cancelFileRisk`; al final, el `TContractFile` se marca con la
   * cancelación y pasa a `'Modificar'` -- SIEMPRE, incluso si no había
   * ningún `TFileRisk` que cancelar (idéntico al original).
   */
  private async cancelContractFile(
    ideContract: string,
    ideContractFile: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const contract = await tx.tContract.findUniqueOrThrow({ where: { IdeContract: ideContract } });
    const tstCancellation = contract.TstCancellation!;
    const desCancellation = contract.DesCancellation ?? undefined;
    const ideActivo = await this.stateMachine.getStateByCode('Activo');

    const file = await tx.tContractFile.findFirst({
      where: {
        IdeContractFile: ideContractFile,
        IdeState: ideActivo,
        TstInitial: { lte: tstCancellation },
        TstEnd: { gte: tstCancellation },
      },
      select: { IdeContractFile: true },
    });
    if (file) {
      const fileRisks = await tx.tFileRisk.findMany({
        where: {
          IdeContractFile: ideContractFile,
          IdeState: ideActivo,
          TstInitial: { lte: tstCancellation },
          TstEnd: { gte: tstCancellation },
        },
        select: { IdeFileRisk: true },
      });
      for (const fileRisk of fileRisks) {
        await this.cancelFileRisk(ideContract, fileRisk.IdeFileRisk, actor, tx);
      }
    }

    const currentFile = await tx.tContractFile.findUniqueOrThrow({ where: { IdeContractFile: ideContractFile } });
    const nextState = await this.stateMachine.getNextState('TContractFile', currentFile.IdeState, 'Modificar');
    await tx.tContractFile.update({
      where: { IdeContractFile: ideContractFile },
      data: {
        TstCancellation: tstCancellation,
        DesCancellation: desCancellation,
        IdeState: nextState,
        UsrModification: actor,
        TstModification: new Date(),
      },
    });
  }

  /**
   * Equivalente a `FFileRisk('CANCELCONTRACT', ...)` (fuente confirmada
   * vía `find-legacy-function.js FFileRisk` -- el único hueco que
   * `investigate-contract-engine.js` no capturaba en su primera corrida):
   * por cada `TRiskCoverage` activa y dentro de la ventana de anulación
   * (sobre la cobertura, no sobre el `TFileRisk` -- el original no
   * chequea la ventana del `TFileRisk` acá, solo que esté `Activo`),
   * cascada hacia `cancelRiskCoverage`; al final, el `TFileRisk` se marca
   * con la cancelación y pasa a `'Modificar'`, siempre.
   */
  private async cancelFileRisk(
    ideContract: string,
    ideFileRisk: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const contract = await tx.tContract.findUniqueOrThrow({ where: { IdeContract: ideContract } });
    const tstCancellation = contract.TstCancellation!;
    const desCancellation = contract.DesCancellation ?? undefined;
    const ideActivo = await this.stateMachine.getStateByCode('Activo');

    const fileRisk = await tx.tFileRisk.findFirst({
      where: { IdeFileRisk: ideFileRisk, IdeState: ideActivo },
      select: { IdeFileRisk: true },
    });
    if (fileRisk) {
      const riskCoverages = await tx.tRiskCoverage.findMany({
        where: {
          IdeFileRisk: ideFileRisk,
          IdeState: ideActivo,
          TstInitial: { lte: tstCancellation },
          TstEnd: { gte: tstCancellation },
        },
        select: { IdeRiskCoverage: true },
      });
      for (const riskCoverage of riskCoverages) {
        await this.cancelRiskCoverage(ideContract, riskCoverage.IdeRiskCoverage, actor, tx);
      }
    }

    const current = await tx.tFileRisk.findUniqueOrThrow({ where: { IdeFileRisk: ideFileRisk } });
    const nextState = await this.stateMachine.getNextState('TFileRisk', current.IdeState, 'Modificar');
    await tx.tFileRisk.update({
      where: { IdeFileRisk: ideFileRisk },
      data: {
        TstCancellation: tstCancellation,
        DesCancellation: desCancellation,
        IdeState: nextState,
        UsrModification: actor,
        TstModification: new Date(),
      },
    });
  }

  /**
   * Equivalente a `FRiskCoverage('CANCELCONTRACT', ...)`: si la cobertura
   * está activa y la fecha de anulación cae en su ventana, genera su
   * movimiento de cierre (`createCancellationMovement`) y la deja en 0
   * (`Amount`/`Rate`/`Prime`), en `'Modificar'`. A diferencia de
   * `TContractFile`/`TFileRisk`, acá el original NO actualiza nada si la
   * cobertura no matchea la condición (no hay "siempre" al final).
   */
  private async cancelRiskCoverage(
    ideContract: string,
    ideRiskCoverage: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const contract = await tx.tContract.findUniqueOrThrow({ where: { IdeContract: ideContract } });
    const tstCancellation = contract.TstCancellation!;
    const desCancellation = contract.DesCancellation ?? undefined;
    const ideActivo = await this.stateMachine.getStateByCode('Activo');

    const riskCoverage = await tx.tRiskCoverage.findFirst({
      where: {
        IdeRiskCoverage: ideRiskCoverage,
        IdeState: ideActivo,
        TstInitial: { lte: tstCancellation },
        TstEnd: { gte: tstCancellation },
      },
      include: { TFileRisk: { select: { IdeContractFile: true } } },
    });
    if (!riskCoverage) return;

    await this.createCancellationMovement(riskCoverage.TFileRisk.IdeContractFile, ideRiskCoverage, actor, tx);

    const nextState = await this.stateMachine.getNextState('TRiskCoverage', riskCoverage.IdeState, 'Modificar');
    await tx.tRiskCoverage.update({
      where: { IdeRiskCoverage: ideRiskCoverage },
      data: {
        Amount: 0,
        Rate: 0,
        Prime: 0,
        TstCancellation: tstCancellation,
        DesCancellation: desCancellation,
        IdeState: nextState,
        UsrModification: actor,
        TstModification: new Date(),
      },
    });
  }

  /**
   * Equivalente a `FCoverageMovement('CANCELCONTRACT', ...)`: crea el
   * movimiento de cierre (`NumCoverageMovement` = máximo existente + 1,
   * `[TstCancellation, TstEnd del CONTRATO]` -- ojo, del contrato, NO del
   * `TContractFile`, confirmado contra el código real -- `Amount=Rate=Prime=0`,
   * SIN `IdeContractOperation` -- eso es lo que después usan
   * `setCancelConcept`/`setCancelPrime`/`generateReceipts`
   * para encontrarlo), y marca el movimiento anterior como `'Modificar'`.
   */
  private async createCancellationMovement(
    ideContractFile: string,
    ideRiskCoverage: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const contractFile = await tx.tContractFile.findFirstOrThrow({
      where: { IdeContractFile: ideContractFile, IdeState: ideActivo },
      select: { IdeContract: true },
    });
    const contract = await tx.tContract.findFirstOrThrow({
      where: { IdeContract: contractFile.IdeContract, IdeState: ideActivo },
      select: { TstCancellation: true, TstEnd: true },
    });
    const tstCancellation = contract.TstCancellation!;
    const tstEnd = contract.TstEnd!;

    const lastMovement = await tx.tCoverageMovement.findFirst({
      where: { IdeRiskCoverage: ideRiskCoverage, IdeState: ideActivo },
      orderBy: { NumCoverageMovement: 'desc' },
      select: { IdeCoverageMovement: true, NumCoverageMovement: true, IdeState: true },
    });
    const numCoverageMovement = lastMovement?.NumCoverageMovement ?? 0;

    const ideMovementInitial = await this.stateMachine.getInitialState('TCoverageMovement');
    const now = new Date();
    await tx.tCoverageMovement.create({
      data: {
        IdeRiskCoverage: ideRiskCoverage,
        NumCoverageMovement: numCoverageMovement + 1,
        TstInitial: tstCancellation,
        TstEnd: tstEnd,
        Amount: 0,
        Rate: 0,
        Prime: 0,
        IdeState: ideMovementInitial,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });

    if (lastMovement) {
      const nextState = await this.stateMachine.getNextState('TCoverageMovement', lastMovement.IdeState, 'Modificar');
      await tx.tCoverageMovement.update({
        where: { IdeCoverageMovement: lastMovement.IdeCoverageMovement },
        data: { IdeState: nextState, UsrModification: actor, TstModification: now },
      });
    }
  }

  /**
   * Equivalente a `FMovementConcept('SetCancelConcept', ...)`: por cada
   * movimiento de cierre generado en este `TContractFile` (`IdeContractOperation
   * IS NULL`, el mismo filtro que usa el original para encontrarlos),
   * inserta en 0 los conceptos que le corresponderían según la jerarquía
   * real de reglas de cálculo (Producto > PlanProductRisk > CoveragePlan)
   * -- reutiliza `RulesEngineService.getApplicableRules` porque su
   * `PrismaCalculationRuleRepository` ya implementa exactamente ese mismo
   * join/jerarquía (confirmado leyendo su código), evitando reimplementar
   * la consulta a mano. Los conceptos con `DesColumnName` configurado se
   * saltan (mismo criterio que el original: esos sobreescriben una
   * columna, no generan una fila de concepto).
   */
  private async setCancelConcept(
    ideContractFile: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const contractFile = await tx.tContractFile.findUniqueOrThrow({
      where: { IdeContractFile: ideContractFile },
      select: { IdeContract: true },
    });
    const contract = await tx.tContract.findUniqueOrThrow({
      where: { IdeContract: contractFile.IdeContract },
      select: { IdeProduct: true },
    });

    const movements = await tx.tCoverageMovement.findMany({
      where: {
        IdeContractOperation: null,
        TRiskCoverage: { TFileRisk: { IdeContractFile: ideContractFile } },
      },
      include: {
        TRiskCoverage: { select: { IdeCoveragePlan: true, TFileRisk: { select: { IdePlanProductRisk: true } } } },
      },
      orderBy: [{ IdeRiskCoverage: 'asc' }, { NumCoverageMovement: 'asc' }],
    });
    if (movements.length === 0) return;

    const ideMovementConceptInitial = await this.stateMachine.getInitialState('TMovementConcept');
    const now = new Date();

    for (const movement of movements) {
      const rules = await this.rulesEngine.getApplicableRules({
        ideProduct: contract.IdeProduct,
        idePlanProductRisk: movement.TRiskCoverage.TFileRisk.IdePlanProductRisk,
        ideCoveragePlan: movement.TRiskCoverage.IdeCoveragePlan,
      });
      for (const rule of rules) {
        if (rule.desColumnName) continue;
        await tx.tMovementConcept.create({
          data: {
            IdeCoverageMovement: movement.IdeCoverageMovement,
            IdeConcept: rule.ideConcept,
            ConceptValue: 0,
            ConceptNetValue: 0,
            IdeState: ideMovementConceptInitial,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });
      }
    }
  }

  /**
   * Equivalente a `FMovementConcept('SetCancelPrime', ...)`: para cada
   * movimiento de cierre (`IdeContractOperation IS NULL`) de cada
   * `TRiskCoverage` del `TContractFile`, recorre DÍA A DÍA su ventana
   * `[TstInitial, TstEnd]`; para cada día, busca el movimiento anterior
   * (`NumCoverageMovement` menor) que cubra esa fecha, y por cada concepto
   * de ESE movimiento anterior cuyo tipo (`SConceptType.CodConceptType`)
   * sea `CALCPRIMA`/`CALCCOMISION`/`CALCIMPUESTO` -- habilitado por
   * `SProductEndorsement.ConditionData.refundPremium/refundCommission/refundTax`
   * respectivamente -- suma al concepto equivalente del movimiento NUEVO
   * la diferencia `(valorNuevo/díasNuevo - valorNetoAnterior/díasAnterior)`.
   * Al terminar cada movimiento, recalcula su concepto `PrimaTotal` como
   * `PrimaNeta + suma(conceptos CALCIMPUESTO)` (redondeado a 2 decimales)
   * y actualiza `TCoverageMovement.Prime` con ese valor. Al final de cada
   * cobertura, actualiza `TRiskCoverage.Prime` -- el original lee ahí
   * `ConceptValue` (NO `ConceptNetValue`) del concepto `PrimaTotal`, que
   * `setCancelConcept` siempre deja en 0 y este método nunca modifica
   * (solo toca `ConceptNetValue`) -- confirmado contra el código real: es
   * un comportamiento real del original (`TRiskCoverage.Prime` queda en 0
   * tras una anulación), no una simplificación de esta implementación, y
   * se replica tal cual.
   *
   * Nota de performance: el recorrido día a día es fiel al cursor del
   * original (una fila de `TMovementConcept` por día potencialmente
   * evaluada) -- para vigencias largas esto es O(días), aceptable para
   * esta fase pero candidato a optimizar si hiciera falta más adelante.
   */
  private async setCancelPrime(
    ideContractFile: string,
    ideProductEndorsement: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const endorsement = await tx.sProductEndorsement.findUniqueOrThrow({
      where: { IdeProductEndorsement: ideProductEndorsement },
    });
    const conditionData =
      (endorsement.ConditionData as unknown as {
        refundPremium?: string;
        refundCommission?: string;
        refundTax?: string;
      } | null) ?? {};
    const { refundPremium, refundCommission, refundTax } = conditionData;

    const [primaNetaConcept, primaTotalConcept] = await Promise.all([
      tx.sConcept.findFirst({ where: { CodConcept: 'PrimaNeta' } }),
      tx.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' } }),
    ]);

    const now = new Date();
    const riskCoverages = await tx.tRiskCoverage.findMany({
      where: { TFileRisk: { IdeContractFile: ideContractFile } },
      select: { IdeRiskCoverage: true },
    });

    for (const { IdeRiskCoverage: ideRiskCoverage } of riskCoverages) {
      const newMovements = await tx.tCoverageMovement.findMany({
        where: { IdeRiskCoverage: ideRiskCoverage, IdeContractOperation: null },
      });
      let lastProcessed: string | null = null;

      for (const newMovement of newMovements) {
        const daysPrimeCalcNew = daysBetween(newMovement.TstInitial, newMovement.TstEnd);
        let cursor = newMovement.TstInitial;
        while (cursor.getTime() <= newMovement.TstEnd.getTime()) {
          const oldMovement = await tx.tCoverageMovement.findFirst({
            where: {
              IdeRiskCoverage: ideRiskCoverage,
              NumCoverageMovement: { lt: newMovement.NumCoverageMovement },
              TstInitial: { lte: cursor },
              TstEnd: { gte: cursor },
            },
            orderBy: { NumCoverageMovement: 'desc' },
          });

          if (oldMovement) {
            const daysPrimeCalcOld = daysBetween(oldMovement.TstInitial, oldMovement.TstEnd);
            const oldConcepts = await tx.tMovementConcept.findMany({
              where: { IdeCoverageMovement: oldMovement.IdeCoverageMovement },
              include: { SConcept: { include: { SConceptType: { select: { CodConceptType: true } } } } },
            });
            for (const oldConcept of oldConcepts) {
              const codConceptType = oldConcept.SConcept.SConceptType.CodConceptType;
              const applies =
                (codConceptType === 'CALCPRIMA' && refundPremium === 'SI') ||
                (codConceptType === 'CALCCOMISION' && refundCommission === 'SI') ||
                (codConceptType === 'CALCIMPUESTO' && refundTax === 'SI');
              if (!applies) continue;

              const newConcept = await tx.tMovementConcept.findFirst({
                where: { IdeCoverageMovement: newMovement.IdeCoverageMovement, IdeConcept: oldConcept.IdeConcept },
              });
              if (!newConcept) continue;

              const delta =
                Number(newConcept.ConceptValue) / daysPrimeCalcNew -
                Number(oldConcept.ConceptNetValue) / daysPrimeCalcOld;
              await tx.tMovementConcept.update({
                where: { IdeMovementConcept: newConcept.IdeMovementConcept },
                data: {
                  ConceptNetValue: Number(newConcept.ConceptNetValue) + delta,
                  UsrModification: actor,
                  TstModification: now,
                },
              });
            }
          }
          cursor = addDays(cursor, 1);
        }

        if (primaTotalConcept) {
          const [primaNetaRow, taxRows] = await Promise.all([
            primaNetaConcept
              ? tx.tMovementConcept.findFirst({
                  where: {
                    IdeCoverageMovement: newMovement.IdeCoverageMovement,
                    IdeConcept: primaNetaConcept.IdeConcept,
                  },
                })
              : Promise.resolve(null),
            tx.tMovementConcept.findMany({
              where: {
                IdeCoverageMovement: newMovement.IdeCoverageMovement,
                SConcept: { SConceptType: { CodConceptType: 'CALCIMPUESTO' } },
              },
            }),
          ]);
          const primaTotalValue = round2(
            (primaNetaRow ? Number(primaNetaRow.ConceptNetValue) : 0) +
              taxRows.reduce((sum, row) => sum + Number(row.ConceptNetValue), 0),
          );
          await tx.tMovementConcept.updateMany({
            where: { IdeCoverageMovement: newMovement.IdeCoverageMovement, IdeConcept: primaTotalConcept.IdeConcept },
            data: { ConceptNetValue: primaTotalValue, UsrModification: actor, TstModification: now },
          });
          await tx.tCoverageMovement.update({
            where: { IdeCoverageMovement: newMovement.IdeCoverageMovement },
            data: { Prime: primaTotalValue, UsrModification: actor, TstModification: now },
          });
        }
        lastProcessed = newMovement.IdeCoverageMovement;
      }

      if (lastProcessed && primaTotalConcept) {
        const primaTotalRow = await tx.tMovementConcept.findFirst({
          where: { IdeCoverageMovement: lastProcessed, IdeConcept: primaTotalConcept.IdeConcept },
        });
        await tx.tRiskCoverage.update({
          where: { IdeRiskCoverage: ideRiskCoverage },
          data: {
            Prime: primaTotalRow ? round2(Number(primaTotalRow.ConceptValue)) : 0,
            UsrModification: actor,
            TstModification: now,
          },
        });
      }
    }
  }

  /**
   * Equivalente literal a la rama compartida `FReceipt('NEWCONTRACT'|'CANCELCONTRACT', ...)`
   * -- una sola implementación para ambos casos, tal como es en el
   * original. Usado tanto por `create()` (`ideProductEndorsement=null`,
   * sin lógica de devolución) como por `cancel()` (`ideProductEndorsement`
   * del endoso de anulación, con `refundPremium`/`refundCommission`/`refundTax`).
   *
   * Genera SIEMPRE una operación `RECEGENE` nueva (nunca reutiliza la que
   * le pasan) y re-apunta a ella TODOS los movimientos en Borrador de TODO
   * el contrato (`IdeContractOperation IS NULL`, no solo los de esta
   * llamada) -- por eso `createInitialMovements`/`createCancellationMovement`
   * dejan sus movimientos con `IdeContractOperation=null` al crearlos, en
   * vez de asignarles la operación CONTGENE/de anulación directamente. Por
   * cada `TContractFile` con movimientos en esa operación, crea un recibo
   * con un detalle por CADA concepto (`TMovementConcept`) de cada
   * movimiento (no un resumen), más una línea de comisión por cada
   * concepto `PrimaNeta`, calculada contra el árbol real
   * (`SCommissionTree`/`SCommissionTable`/`SCommission` del canal de
   * distribución principal vigente) -- `TReceipt.Fee` es la suma de esas
   * líneas de comisión, truncada a 2 decimales (`trunc(vFee,2)` en el
   * original; las líneas individuales de comisión NO se redondean, fiel
   * al original).
   *
   * El tipo de recibo (NEW/REN/SUP) usa el mismo `CASE` que el original
   * (ya documentado como defectuoso, comentario
   * `*******REVISAR ESTE PROCESO ESTA MALO*********`): para un contrato
   * nuevo, `NumOperation=2` (CONTGENE=1, este RECEGENE=2) y `ContractAge=1`
   * (confirmado literal en el `INSERT` real de `TContract` para
   * CONTRACTNEW) resuelven a `'NEW'`; para una anulación, `NumOperation`
   * ya es > 2 (CONTGENE=1, operación de anulación=2, RECEGENE=3+), así
   * que siempre resuelve a `'SUP'`.
   */
  private async generateReceipts(
    ideContract: string,
    ideProductEndorsement: string | null,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const conditionData = ideProductEndorsement
      ? (((
          await tx.sProductEndorsement.findUniqueOrThrow({
            where: { IdeProductEndorsement: ideProductEndorsement },
          })
        ).ConditionData as unknown as { refundCommission?: string } | null) ?? {})
      : {};
    const refundCommission = conditionData.refundCommission;

    const contract = await tx.tContract.findUniqueOrThrow({ where: { IdeContract: ideContract } });
    const comisionConcept = await tx.sConcept.findFirst({ where: { CodConcept: 'Comision' } });
    if (!comisionConcept) {
      throw new NotFoundException('No existe el concepto "Comision" (SConcept) requerido para generar el recibo');
    }

    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();

    const mainChannel = await this.resolveMainDistributionChannel(ideContract, ideActivo, now, tx);

    // Operación RECEGENE -- SIEMPRE nueva (confirmado: el original no
    // reutiliza una existente), y re-apunte de TODOS los movimientos en
    // Borrador del contrato (no solo los de esta anulación).
    const contractOperation = await this.createContractOperation(ideContract, contract.IdeProduct, 'RECEGENE', actor, tx);
    const operationProduct = await tx.sOperationProduct.findUniqueOrThrow({
      where: { IdeOperationProduct: contractOperation.IdeOperationProduct },
    });

    const ideBorrador = await this.stateMachine.getInitialState('TCoverageMovement');
    const draftMovements = await tx.tCoverageMovement.findMany({
      where: {
        IdeContractOperation: null,
        IdeState: ideBorrador,
        TRiskCoverage: { TFileRisk: { TContractFile: { IdeContract: ideContract } } },
      },
      select: { IdeCoverageMovement: true },
    });
    await tx.tCoverageMovement.updateMany({
      where: { IdeCoverageMovement: { in: draftMovements.map((m) => m.IdeCoverageMovement) } },
      data: { IdeContractOperation: contractOperation.IdeContractOperation, UsrModification: actor, TstModification: now },
    });

    const numOperation = contractOperation.NumOperation;
    const receiptTypeCode =
      numOperation === 2 && contract.ContractAge === 1
        ? 'NEW'
        : numOperation > 2
          ? 'SUP'
          : numOperation === 2 && contract.ContractAge > 1
            ? 'REN'
            : null;
    if (!receiptTypeCode) {
      throw new ConflictException(
        `No se pudo determinar el tipo de recibo para NumOperation=${numOperation}/ContractAge=${contract.ContractAge}`,
      );
    }
    const ideReceiptType = await this.resolveReceiptType(receiptTypeCode);

    const movements = await tx.tCoverageMovement.findMany({
      where: { IdeContractOperation: contractOperation.IdeContractOperation },
      include: {
        TRiskCoverage: {
          select: {
            IdeCoveragePlan: true,
            TFileRisk: { select: { IdeContractFile: true, IdePlanProductRisk: true } },
          },
        },
      },
    });

    const movementsByFile = new Map<string, typeof movements>();
    for (const movement of movements) {
      const ideContractFile = movement.TRiskCoverage.TFileRisk.IdeContractFile;
      const bucket = movementsByFile.get(ideContractFile) ?? [];
      bucket.push(movement);
      movementsByFile.set(ideContractFile, bucket);
    }

    const [ideReceiptInitial, ideReceiptDetailInitial] = await Promise.all([
      this.stateMachine.getInitialState('TReceipt'),
      this.stateMachine.getInitialState('TReceiptDetail'),
    ]);

    for (const [ideContractFile, fileMovements] of movementsByFile) {
      const initialDate = new Date(Math.min(...fileMovements.map((m) => m.TstInitial.getTime())));
      const endDate = new Date(Math.max(...fileMovements.map((m) => m.TstEnd.getTime())));
      const primeSum = round2(fileMovements.reduce((sum, m) => sum + Number(m.Prime), 0));

      const receipt = await tx.tReceipt.create({
        data: {
          IdeContractFile: ideContractFile,
          IdeContractOperation: contractOperation.IdeContractOperation,
          IdeContract: ideContract,
          IdeReceiptType: ideReceiptType,
          NumReceipt: await this.generateNumReceipt(contract.IdeProduct),
          TstIssue: now,
          TstInitial: initialDate,
          TstEnd: endDate,
          Fee: 0,
          Prime: primeSum,
          IdeState: ideReceiptInitial,
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });

      for (const movement of fileMovements) {
        const ideInsuranceLine = await this.resolveInsuranceLine(movement.TRiskCoverage.IdeCoveragePlan);
        const concepts = await tx.tMovementConcept.findMany({
          where: { IdeCoverageMovement: movement.IdeCoverageMovement },
          include: { SConcept: { select: { IdeConcept: true, CodConcept: true } } },
        });

        for (const concept of concepts) {
          await tx.tReceiptDetail.create({
            data: {
              IdeReceipt: receipt.IdeReceipt,
              IdeCoverageMovement: movement.IdeCoverageMovement,
              IdeInsuranceLine: ideInsuranceLine,
              IdeConcept: concept.IdeConcept,
              ConceptValue: round2(Number(concept.ConceptNetValue)),
              IdeState: ideReceiptDetailInitial,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            },
          });

          if (concept.SConcept.CodConcept !== 'PrimaNeta') continue;

          const percentage = await this.resolveCommissionPercentage({
            ideDistributionChannel: mainChannel.IdeDistributionChannel,
            ideProduct: contract.IdeProduct,
            idePlanProductRisk: movement.TRiskCoverage.TFileRisk.IdePlanProductRisk,
            ideCoveragePlan: movement.TRiskCoverage.IdeCoveragePlan,
            ideProcess: operationProduct.IdeProcess,
          }, tx);
          const netValue = Number(concept.ConceptNetValue);
          let commissionValue = 0;
          if (percentage !== null) {
            const suppressForRefundNo = netValue <= 0 && refundCommission === 'NO';
            // Fiel al original: la comisión por línea NO se redondea acá --
            // solo el total `Fee` del recibo se trunca a 2 decimales más
            // abajo (`trunc(vFee,2)` en el `FReceipt` real).
            commissionValue = suppressForRefundNo ? 0 : (netValue * percentage) / 100;
          }
          await tx.tReceiptDetail.create({
            data: {
              IdeReceipt: receipt.IdeReceipt,
              IdeCoverageMovement: movement.IdeCoverageMovement,
              IdeInsuranceLine: ideInsuranceLine,
              IdeConcept: comisionConcept.IdeConcept,
              ConceptValue: commissionValue,
              IdeState: ideReceiptDetailInitial,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            },
          });
        }
      }

      const commissionRows = await tx.tReceiptDetail.findMany({
        where: { IdeReceipt: receipt.IdeReceipt, IdeConcept: comisionConcept.IdeConcept },
      });
      const fee = commissionRows.reduce((sum, row) => sum + Number(row.ConceptValue), 0);
      await tx.tReceipt.update({
        where: { IdeReceipt: receipt.IdeReceipt },
        data: { Fee: trunc2(fee), UsrModification: actor, TstModification: now },
      });
    }
  }

  /**
   * Replica literalmente `greatest(now(),"TstInitial") between "TstInitial"
   * and "TstEnd"` del `FReceipt` real (equivalente a `TstInitial <= TstEnd`
   * cuando el canal arranca en el futuro -- un canal aún no vigente
   * igual puede matchear si su ventana es válida; comportamiento real
   * confirmado contra el código fuente, no un error de esta
   * implementación) para encontrar el canal principal (`IndMain=true`,
   * `Activo`) vigente, tomando el de mayor `NumMovement` entre los que
   * matchean (mismo criterio del `select max(NumMovement)` del original).
   */
  private async resolveMainDistributionChannel(
    ideContract: string,
    ideActivo: string,
    now: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const channels = await tx.tContractDistributionChannel.findMany({
      where: { IdeContract: ideContract, IndMain: true, IdeState: ideActivo },
    });
    const eligible = channels.filter((channel) => {
      const greatest = channel.TstInitial.getTime() > now.getTime() ? channel.TstInitial : now;
      return greatest.getTime() <= channel.TstEnd.getTime();
    });
    eligible.sort((a, b) => b.NumMovement - a.NumMovement);
    const mainChannel = eligible[0];
    if (!mainChannel) {
      throw new NotFoundException(`El contrato "${ideContract}" no tiene un canal de distribución principal vigente`);
    }
    return mainChannel;
  }

  /**
   * Equivalente al `select sco."Percentaje" ... from SCommissionTree ctr,
   * SCommissionTable cta, SCommission sco ...` del `FReceipt` real: cadena
   * Canal -> Árbol de comisión -> Tabla (por Producto, opcionalmente
   * Plan/Cobertura) -> Comisión vigente (por Proceso y fecha, tomando el
   * `NumMovement` más alto -- mismo criterio que el `select max(...)`
   * subconsulta del original). Cuando hay más de una `SCommissionTable`
   * que matchea, el original no tiene un criterio de desempate explícito
   * (un solo `select ... into` sin `ORDER BY`, orden indefinido en
   * Postgres); acá se prefiere determinísticamente la más específica
   * (Plan+Cobertura, luego solo uno de los dos, luego comodín) --
   * simplificación documentada, no una réplica bit a bit de un
   * comportamiento indefinido del original.
   */
  private async resolveCommissionPercentage(
    params: {
      ideDistributionChannel: string;
      ideProduct: string;
      idePlanProductRisk: string;
      ideCoveragePlan: string;
      ideProcess: string;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<number | null> {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();

    const trees = await tx.sCommissionTree.findMany({
      where: { IdeDistributionChannel: params.ideDistributionChannel, IdeState: ideActivo },
      select: { IdeCommissionTree: true },
    });
    if (trees.length === 0) return null;

    const tables = await tx.sCommissionTable.findMany({
      where: {
        IdeCommissionTree: { in: trees.map((t) => t.IdeCommissionTree) },
        IdeProduct: params.ideProduct,
        IdeState: ideActivo,
        OR: [{ IdePlanProductRisk: params.idePlanProductRisk }, { IdePlanProductRisk: null }],
      },
    });
    const matching = tables
      .filter((t) => t.IdeCoveragePlan === null || t.IdeCoveragePlan === params.ideCoveragePlan)
      .sort((a, b) => commissionTableSpecificity(b) - commissionTableSpecificity(a));
    const table = matching[0];
    if (!table) return null;

    const commission = await tx.sCommission.findFirst({
      where: {
        IdeCommissionTable: table.IdeCommissionTable,
        IdeProcess: params.ideProcess,
        TstInitial: { lte: now },
        TstEnd: { gte: now },
        IdeState: ideActivo,
      },
      orderBy: { NumMovement: 'desc' },
    });
    return commission ? Number(commission.Percentaje) : null;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function trunc2(value: number): number {
  return Math.trunc(value * 100) / 100;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function commissionTableSpecificity(table: { IdePlanProductRisk: string | null; IdeCoveragePlan: string | null }): number {
  return (table.IdePlanProductRisk ? 1 : 0) + (table.IdeCoveragePlan ? 1 : 0);
}
