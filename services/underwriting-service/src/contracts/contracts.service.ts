import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import { RulesEngineService, StateMachineService } from '@ars-platform/shared-common';
import { QuotesService } from '../quoting/quotes.service';
import { RequirementsService } from '../requirements/requirements.service';
import { DocumentsHttpClient } from '../documents/documents-http.client';
import { CreateContractDto } from './dto/create-contract.dto';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { ChangeInsuredAmountDto } from './dto/change-insured-amount.dto';
import { AddCoverageDto } from './dto/add-coverage.dto';
import { RemoveCoverageDto } from './dto/remove-coverage.dto';
import { AddRiskDto } from './dto/add-risk.dto';
import { RemoveRiskDto } from './dto/remove-risk.dto';
import { ChangePersonDataDto } from './dto/change-person-data.dto';
import { ListContractsDto } from './dto/list-contracts.dto';
import { ListRenewalCandidatesDto } from './dto/list-renewal-candidates.dto';

/**
 * Timeout de la transacción que envuelve `cancel()` -- generoso porque
 * `setCancelPrime` recorre día a día toda la vigencia del movimiento de
 * cierre (cientos de round-trips a Postgres para una vigencia anual,
 * confirmado ~1-2 minutos en la práctica contra un pooler remoto). Los
 * 5 segundos por defecto de Prisma no alcanzan ni de cerca.
 */
const CANCEL_TRANSACTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Timeout de la transacción que envuelve `changeInsuredAmount()`. Mismo
 * orden de magnitud que `cancel()` (no `create()`): `setSupplementPrime`
 * también recorre día a día la ventana del movimiento nuevo, mismo patrón
 * de prorrateo ya optimizado (una sola consulta de movimientos viejos,
 * no una por día) que `setCancelPrime`.
 */
const SUPPLEMENT_TRANSACTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Timeout de la transacción que envuelve `create()`. Más corto que el de
 * `cancel()` porque acá no hay un prorrateo día a día de toda la vigencia
 * (eso solo existe en `setCancelPrime`) -- la cascada de alta es una
 * cantidad acotada de escrituras por riesgo/cobertura (normalmente unas
 * pocas), pero se deja generoso igual por los mismos motivos (pooler
 * remoto, varios round-trips por `RulesEngineService.evaluateChain` en
 * `createInitialMovements`).
 */
const CREATE_TRANSACTION_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos

/**
 * Ventana de renovación manual: cuántos días antes del vencimiento (o ya
 * vencido) se permite tocar "Renovar contrato" -- fuera de esa ventana el
 * botón/endpoint lo rechaza, para que no se pueda renovar por error un
 * contrato recién contratado al que todavía le queda mucho tiempo de
 * vigencia. Valor fijo por ahora; se vuelve configurable en la Etapa 2
 * (pantalla de candidatos a renovar, ver docs/02-roadmap.md), que va a
 * aplicar el mismo criterio ("X meses antes de vencer") a nivel de
 * pantalla en vez de depender de este chequeo del endpoint.
 */
const MANUAL_RENEWAL_WINDOW_DAYS = 30;

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
 * (`TReceipt`/`TReceiptDetail`) -> transición a "Contratar" de la cotización
 * de origen (marca la cotización como convertida, reutilizando
 * `QuotesService.transitionState`).
 *
 * DESVIACIÓN DELIBERADA respecto al `FContract` original (pedido explícito
 * del usuario, ver "Activar contrato" en docs/02-roadmap.md, diferido el
 * 2026-09-28 y cerrado ahora): el original transicionaba TODO el árbol del
 * contrato a "Activar" dentro de esta misma cascada, así que un contrato
 * nunca quedaba visible en Borrador. Acá se saca ese paso de `create()` a
 * propósito -- el contrato queda en Borrador al contratarse, y `activate()`
 * (más abajo) es la acción explícita nueva que lo activa. Reutiliza el
 * mismo `applyStateCascade` que antes llamaba `activateContractTree`
 * (eliminado), así que la cascada en sí (los mismos 6 niveles) no cambió.
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
    private readonly requirementsService: RequirementsService,
    private readonly documentsHttpClient: DocumentsHttpClient,
  ) {}

  /**
   * Punto de entrada de toda la cascada. Las precondiciones de solo
   * lectura (cotización existe/no tiene contrato previo/está "Aceptado",
   * personas listas para emisión) corren ANTES de abrir transacción, igual
   * criterio que `cancel()`. Desde `buildContract` en adelante, TODA la
   * cascada corre en UNA transacción de Postgres (`this.prisma.$transaction`,
   * mismo patrón ya usado por `cancel()` más abajo) -- antes de este cambio,
   * un fallo a mitad de camino (confirmado en la práctica: faltaba
   * `SStateRule.IndInitialState` para `TContractRequirement` en una BD real)
   * dejaba un `TContract` huérfano grabado, y como la precondición de este
   * método revisa `quote.TContract.length > 0`, un reintento fallaba
   * incorrectamente con "ya tiene un contrato asociado" en vez de poder
   * reintentar limpio. `this.stateMachine`/`this.rulesEngine` se dejan
   * FUERA de la transacción a propósito (mismo razonamiento documentado en
   * `cancel()`): solo leen catálogo que esta cascada nunca escribe.
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

    await this.assertPersonsReadyForIssuance(quote.IdeQuote);
    await this.requirementsService.assertQuoteRequirementsReady(quote.IdeQuote, actor);

    const ideContract = await this.prisma.$transaction(
      async (tx) => {
        const contract = await this.buildContract(quote, dto, actor, tx);
        await this.setContractPersons(quote.IdeQuote, contract.IdeContract, actor, tx);
        await this.setContractDistributionChannel(quote.IdeDistributionChannel, quote.IdeProduct, contract, actor, tx);
        await this.setContractBilling(contract, actor, tx);

        const contractFile = await this.createContractFile(contract, actor, tx);
        await this.createInitialContractOperation(contract.IdeContract, actor, tx);

        const riskCoverages = await this.copyRisksAndCoverages(
          quote.IdeQuote,
          contract.IdeProduct,
          contractFile.IdeContractFile,
          actor,
          tx,
        );
        await this.createInitialMovements(riskCoverages, actor, tx);
        await this.setNetPrime(contractFile.IdeContractFile, actor, tx);
        await this.generateReceipts(contract.IdeContract, null, actor, tx);

        await this.quotesService.transitionState(quote.IdeQuote, 'Contratar', actor, tx);

        return contract.IdeContract;
      },
      { timeout: CREATE_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    return this.findOne(ideContract);
  }

  /**
   * Acción explícita "Activar contrato" (pedido del usuario, ver
   * "Activar contrato" en docs/02-roadmap.md): activa TODO el árbol del
   * contrato (`TContract` -> `TContractFile` -> `TFileRisk` ->
   * `TRiskCoverage` -> `TCoverageMovement` -> `TMovementConcept`, misma
   * cascada de `applyStateCascade` que antes se disparaba automáticamente
   * dentro de `create()`) Y, además, a `TContractPerson` (Titular/Tomador,
   * ver `activateContractPersons`) -- una extensión deliberada sobre la
   * cascada original: el `FContract` legado (y por eso `applyStateCascade`,
   * que lo replica fielmente) NUNCA tocaba `TContractPerson` (seedeada
   * "sin transición" en `seed-contract-testing-fixtures.js`, ver
   * `NO_TRANSITION_ENTITIES`), así que Titular/Tomador se quedaba en
   * "Borrador" para siempre aunque el contrato ya estuviera Activo -- gap
   * que el usuario descubrió al probar "Activar contrato" en pantalla
   * (2026-09-29). Requiere haber corrido una vez
   * `packages/database/scripts/seed-activate-contract-person-transition.js`
   * (agrega la transición `SEED_BORRADOR -> ACTIVO` vía `'Activar'` para
   * `TContractPerson`, que el seed original nunca configuró; sin esa fila,
   * `activateContractPersons` fallaría con 404 de transición no
   * configurada). Solo se puede activar un contrato que esté todavía en su
   * estado inicial ("Borrador") -- valida contra
   * `StateMachineService.getInitialState('TContract')` en vez de un código
   * fijo, mismo criterio que el resto del servicio. `TReceipt`/
   * `TReceiptDetail` NO forman parte de esta cascada (ver
   * `applyStateCascade`) -- quedan en su estado inicial, comportamiento
   * preexistente, no algo que este método deba corregir.
   */
  async activate(ideContract: string, actor: string, authorization?: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }

    const ideBorrador = await this.stateMachine.getInitialState('TContract');
    if (existing.IdeState !== ideBorrador) {
      throw new ConflictException(`El contrato "${ideContract}" no está en estado "Borrador"`);
    }

    await this.prisma.$transaction(
      async (tx) => {
        await this.applyStateCascade(ideContract, 'Activar', actor, tx);
        await this.activateContractPersons(ideContract, actor, tx);
      },
      { timeout: CREATE_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    // Correo de bienvenida con la póliza adjunta (ver docs/02-roadmap.md,
    // pedido explícito del usuario 2026-10-01) -- DESPUÉS de que la
    // transacción de activación ya confirmó, y sin bloquear la respuesta
    // de este endpoint si falla (ver doc-comment de `DocumentsHttpClient`:
    // ese cliente nunca lanza, solo loguea). Si no llega `authorization`
    // (llamador interno sin JWT de usuario, ej. un futuro job automático),
    // se salta en silencio en vez de llamar con un header inválido.
    if (authorization) {
      await this.documentsHttpClient.sendWelcomeEmail(ideContract, authorization);
    }

    return this.findOne(ideContract);
  }

  /**
   * Transiciona a `Activo` todas las `TContractPerson` (Titular/Tomador)
   * de este contrato -- ver el doc-comment de `activate()` para el
   * porqué. Filtra por el estado inicial REAL de la entidad
   * (`StateMachineService.getInitialState`, no un código fijo) para no
   * romper si alguna persona ya llegó a Activo por otra vía (reintento,
   * dato migrado a mano, etc.) -- en ese caso simplemente no la toca, en
   * vez de fallar buscando una transición Activo->Activo que no existe.
   */
  private async activateContractPersons(
    ideContract: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const ideContractPersonBorrador = await this.stateMachine.getInitialState('TContractPerson');
    const now = new Date();
    const persons = await tx.tContractPerson.findMany({
      where: { IdeContract: ideContract, IdeState: ideContractPersonBorrador },
    });
    for (const person of persons) {
      const nextState = await this.stateMachine.getNextState('TContractPerson', person.IdeState, 'Activar');
      await tx.tContractPerson.update({
        where: { IdeContractPerson: person.IdeContractPerson },
        data: { IdeState: nextState, UsrModification: actor, TstModification: now },
      });
    }
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
        await this.createContractOperation(ideContract, contract.IdeProduct, codOperation, actor, tx, 'Anular');

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

  /**
   * Cascada del suplemento "Cambio de monto asegurado" -- primer tipo de
   * endoso/suplemento sobre un contrato ya activo (ver docs/02-roadmap.md,
   * ítem 1, "Etapa 2"), distinto de `cancel()`: acá NO se cierra nada, se
   * agrega un movimiento nuevo (`NumCoverageMovement + 1`) a UNA sola
   * `TRiskCoverage` puntual, con el monto nuevo, dejando el resto del
   * árbol del contrato (`TContract`/`TContractFile`/`TFileRisk`/las
   * DEMÁS coberturas) intacto -- por eso no se reutiliza
   * `applyStateCascade` (que transicionaría TODO el árbol y fallaría
   * contra un `TContract` que ya está `Activo` pidiéndole de nuevo
   * `'Activar'`).
   *
   * Decisión de negocio explícita del usuario (2026-09-28): la prima se
   * recalcula asumiendo que escala PROPORCIONALMENTE al monto asegurado
   * (si se duplica la suma asegurada, se duplica la prima del período
   * restante) -- el motor de reglas (`SCalculationRule.FormulaJSON`) no
   * usa `Amount` como variable hoy (confirmado: ninguna fórmula real lo
   * referencia), así que en vez de tocar el motor de reglas para todos
   * los productos, este cálculo escala el valor bruto YA calculado del
   * movimiento anterior por `newAmount / oldAmount` y reutiliza EXACTO el
   * mismo prorrateo día a día por el que ya pasó `setCancelPrime`
   * (`newConcept.ConceptValue / díasNuevo - oldConcept.ConceptNetValue / díasViejo`),
   * solo que sin las banderas de `ConditionData.refundPremium/refundCommission/refundTax`
   * (un suplemento siempre recalcula los 3 tipos, no es condicional como
   * una devolución de anulación).
   *
   * ORDEN: valida el contrato/cobertura (`Activo`, fecha del suplemento
   * dentro de la vigencia del movimiento actual) -> resuelve la operación
   * por el endoso (mismo mecanismo que `cancel()`,
   * `SOperationProduct.IdeProductEndorsement`, sembrada aparte con su
   * propio código de operación, no `ANULGENE`/`RECEGENE`) ->
   * `TContractOperation` nueva (`finalOperative` default `'Activar'`,
   * a diferencia de la anulación) -> movimiento nuevo en Borrador
   * (`createSupplementMovement`, marca el viejo `'Modificar'`, igual
   * criterio que `createCancellationMovement`) -> conceptos del
   * movimiento nuevo escalados por el monto (`setSupplementConcepts`) ->
   * prorrateo día a día (`setSupplementPrime`, también actualiza
   * `TRiskCoverage.Amount`/`Prime`) -> recibo (`generateReceipts`,
   * reutilizado tal cual -- ya resuelve genéricamente a tipo `'SUP'`
   * para cualquier operación con `NumOperation > 2`) -> recién ACÁ, con
   * el movimiento nuevo ya apuntado a su `TContractOperation` real,
   * `activateSupplementMovement` lo pasa (a él y a sus conceptos) de
   * Borrador a Activo -- tiene que ser el ÚLTIMO paso, porque
   * `generateReceipts` solo repunta movimientos que sigan en Borrador.
   */
  async changeInsuredAmount(ideContract: string, dto: ChangeInsuredAmountDto, actor: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }

    const tstSupplement = new Date(dto.tstSupplement);

    await this.prisma.$transaction(
      async (tx) => {
        const { contract, lastMovement } = await this.validateSupplementDate(
          ideContract,
          dto.ideRiskCoverage,
          tstSupplement,
          tx,
        );

        if (Number(lastMovement.Amount) === dto.newAmount) {
          throw new ConflictException('El nuevo monto asegurado debe ser distinto del monto actual');
        }

        const codOperation = await this.resolveOperationCodeByEndorsement(dto.ideProductEndorsement, tx);
        await this.createContractOperation(ideContract, contract.IdeProduct, codOperation, actor, tx);

        const newMovement = await this.createSupplementMovement(
          dto.ideRiskCoverage,
          lastMovement,
          tstSupplement,
          dto.newAmount,
          actor,
          tx,
        );
        await this.setSupplementConcepts(dto.ideRiskCoverage, lastMovement, newMovement, dto.newAmount, actor, tx);
        await this.setSupplementPrime(dto.ideRiskCoverage, newMovement.IdeCoverageMovement, dto.newAmount, actor, tx);

        await this.generateReceipts(ideContract, dto.ideProductEndorsement, actor, tx);
        await this.activateSupplementMovement(newMovement.IdeCoverageMovement, actor, tx);
      },
      { timeout: SUPPLEMENT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    return this.findOne(ideContract);
  }

  /**
   * Suplemento "Alta de cobertura" (Etapa 3 de "Movimientos y
   * suplementos del contrato", ver docs/02-roadmap.md): agrega una
   * `SCoveragePlan` nueva a un `TFileRisk` que ya existe en el
   * contrato -- a diferencia de `changeInsuredAmount`, acá la
   * `TRiskCoverage` no existe todavía, hay que crearla desde cero.
   *
   * Decisión de negocio explícita del usuario (2026-09-28): el monto
   * asegurado por defecto sale de `SCoveragePlan` (`IndFixedAmount ?
   * UpperAmount : 0`, mismo criterio que `populateQuoteCoverages` al
   * cotizar), pero el usuario puede indicar otro monto (`dto.newAmount`).
   * La tasa (`Rate`) sale siempre de `SCoveragePlan.IndFixedRate ?
   * UpperRate : 0` -- no se pidió poder editarla acá.
   *
   * ORDEN: valida contrato/riesgo/plan de cobertura
   * (`validateAddCoverage`) -> resuelve la operación por el endoso
   * (mismo mecanismo que `changeInsuredAmount`) -> crea la
   * `TRiskCoverage` nueva en Borrador (`createNewRiskCoverage`) ->
   * movimiento inicial + conceptos vía el MISMO motor de reglas que usa
   * `create()` para una cobertura recién cotizada (`createInitialMovements`,
   * reutilizado tal cual -- confirmado que a nivel de `TCoverageMovement`
   * el motor de reglas nunca calcula `Amount`/`Rate` dinámicamente, solo
   * los conceptos de prima/impuesto/comisión, así que Amount/Rate
   * puestos a mano en `createNewRiskCoverage` son exactamente lo que
   * este paso espera recibir ya resuelto) -> prorrateo al período de
   * facturación vigente (`setNetPrime`, MISMO método genérico que usa
   * `create()`, acá solo encuentra el ÚNICO movimiento en Borrador que
   * se acaba de crear) -> recibo (`generateReceipts`, reutilizado tal
   * cual) -> recién acá, con el movimiento ya apuntado a su operación
   * real, `activateNewCoverage` pasa la cobertura y su movimiento/
   * conceptos de Borrador a Activo (mismo motivo que en
   * `changeInsuredAmount`: tiene que ser el ÚLTIMO paso).
   *
   * Deliberadamente NO replica `resolveContractRequirementsForCoverage`
   * (los requisitos/checklist de documentación que sí arma
   * `copyRisksAndCoverages` al contratar) -- queda fuera de este alcance,
   * a revisar si hace falta en un paso posterior del roadmap.
   */
  async addCoverage(ideContract: string, dto: AddCoverageDto, actor: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }

    const tstSupplement = new Date(dto.tstSupplement);

    await this.prisma.$transaction(
      async (tx) => {
        const { fileRisk, coveragePlan } = await this.validateAddCoverage(
          ideContract,
          dto.ideFileRisk,
          dto.ideCoveragePlan,
          tstSupplement,
          tx,
        );

        const codOperation = await this.resolveOperationCodeByEndorsement(dto.ideProductEndorsement, tx);
        await this.createContractOperation(ideContract, existing.IdeProduct, codOperation, actor, tx);

        const riskCoverage = await this.createNewRiskCoverage(fileRisk, coveragePlan, dto.newAmount, tstSupplement, actor, tx);

        await this.createInitialMovements(
          [
            {
              ideRiskCoverage: riskCoverage.IdeRiskCoverage,
              ideFileRisk: fileRisk.IdeFileRisk,
              ideCoveragePlan: coveragePlan.IdeCoveragePlan,
              idePlanProductRisk: fileRisk.IdePlanProductRisk,
              ideProduct: existing.IdeProduct,
              prime: 0,
            },
          ],
          actor,
          tx,
        );
        await this.setNetPrime(fileRisk.IdeContractFile, actor, tx);
        await this.generateReceipts(ideContract, dto.ideProductEndorsement, actor, tx);

        const newMovement = await tx.tCoverageMovement.findFirstOrThrow({
          where: { IdeRiskCoverage: riskCoverage.IdeRiskCoverage },
        });
        await this.activateNewCoverage(riskCoverage.IdeRiskCoverage, newMovement.IdeCoverageMovement, actor, tx);
      },
      { timeout: SUPPLEMENT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    return this.findOne(ideContract);
  }

  /**
   * Suplemento "Baja de cobertura" (Etapa 3): cancela UNA `TRiskCoverage`
   * puntual sin tocar el resto del riesgo/contrato. Decisión de negocio
   * explícita del usuario (2026-09-28): la devolución de la prima
   * restante es proporcional al tiempo, MISMO criterio que "Cambio de
   * monto asegurado" -- de hecho, es literalmente ese mismo mecanismo
   * con `newAmount=0`: reutiliza `validateSupplementDate`/
   * `createSupplementMovement`/`setSupplementConcepts`/`setSupplementPrime`/
   * `activateSupplementMovement` sin ningún cambio (confirmado que la
   * fórmula de `setSupplementConcepts` -- `ratio = newAmount/oldAmount`
   * -- da 0 correctamente cuando `newAmount=0`, escalando todos los
   * conceptos de prima/comisión/impuesto a cero). La única diferencia
   * real con "cambio de monto" es el paso final, `closeRiskCoverage`:
   * a diferencia de un cambio de monto (que deja la cobertura `Activo`
   * con su monto nuevo), acá la cobertura se da de baja de verdad, así
   * que pasa a `'Modificar'` (mismo operativo/estado que usa
   * `cancelRiskCoverage` en la anulación total del contrato) para que no
   * quede mostrada como una cobertura activa con monto en 0 para
   * siempre.
   */
  async removeCoverage(ideContract: string, dto: RemoveCoverageDto, actor: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }

    const tstSupplement = new Date(dto.tstSupplement);

    await this.prisma.$transaction(
      async (tx) => {
        const { lastMovement } = await this.validateSupplementDate(ideContract, dto.ideRiskCoverage, tstSupplement, tx);

        if (Number(lastMovement.Amount) === 0) {
          throw new ConflictException('Esta cobertura ya tiene el monto asegurado en 0 -- probablemente ya fue dada de baja');
        }

        const codOperation = await this.resolveOperationCodeByEndorsement(dto.ideProductEndorsement, tx);
        await this.createContractOperation(ideContract, existing.IdeProduct, codOperation, actor, tx);

        const newMovement = await this.createSupplementMovement(dto.ideRiskCoverage, lastMovement, tstSupplement, 0, actor, tx);
        await this.setSupplementConcepts(dto.ideRiskCoverage, lastMovement, newMovement, 0, actor, tx);
        await this.setSupplementPrime(dto.ideRiskCoverage, newMovement.IdeCoverageMovement, 0, actor, tx);

        await this.generateReceipts(ideContract, dto.ideProductEndorsement, actor, tx);
        await this.activateSupplementMovement(newMovement.IdeCoverageMovement, actor, tx);
        await this.closeRiskCoverage(dto.ideRiskCoverage, actor, tx);
      },
      { timeout: SUPPLEMENT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    return this.findOne(ideContract);
  }

  /**
   * Suplemento "Alta de riesgo" (Etapa 4 de "Movimientos y suplementos
   * del contrato", ver docs/02-roadmap.md): agrega un `TFileRisk` nuevo
   * a un certificado (`TContractFile`) que ya existe en el contrato --
   * a diferencia de `addCoverage`, acá NO se eligen coberturas en el
   * mismo paso (decisión de negocio explícita del usuario, 2026-09-28:
   * "mismo mecanismo" que alta de cobertura): el riesgo nace vacío y
   * activo, y el usuario le agrega coberturas después con el mismo botón
   * "Agregar cobertura" de la pestaña Coberturas (Etapa 3).
   *
   * Por eso este suplemento es mucho más simple que `addCoverage`: sin
   * `TRiskCoverage` todavía no hay `TCoverageMovement` ni prima que
   * recalcular, así que no hace falta `createInitialMovements`/
   * `setNetPrime`/`generateReceipts` acá -- esos corren recién cuando se
   * agregue la primera cobertura. Solo dos pasos: la operación de
   * contrato (para que quede trazado en "Movimientos", igual que
   * cualquier otro suplemento) y el `TFileRisk` mismo, ya `Activo`.
   *
   * SÍ acepta `RiskAttributeValue` (los atributos personalizados del
   * riesgo, ver `RiskAttributesService`) -- ajustado 2026-09-29 tras
   * reporte del usuario ("no valida si para ese producto es necesario
   * atributos personalizados, tal como aparecen en la cotización"): el
   * frontend (`ContractDetailComponent`, diálogo "Agregar riesgo")
   * replica el mismo mecanismo que Etapa 1 de cotización
   * (`QuotesComponent.loadRiskFields`/`buildRiskFieldsState`) -- pide
   * `RiskAttributesService.getSchema(ideRiskProduct)` y arma un form
   * dinámico si el riesgo elegido tiene campos configurados. A
   * diferencia de cotización, acá NO se replica el gate de
   * `resolveActiveSteps`/`STEP_CODE_CUSTOM_ATTRIBUTES` (el contrato no
   * expone `CodDistributionChannel` en su respuesta hoy, solo la
   * descripción ya resuelta -- ver `ContractDistributionChannel` en
   * `contracts.service.ts` del frontend): se usa el mismo
   * comportamiento "seguro por defecto" que ya tiene cotización sin
   * canal elegido (no oculta nada), simplemente mostrando el form
   * cuando el schema trae campos. El valor no se valida acá contra la
   * definición de atributos (`class-validator` con `IsOptional()`
   * `IsObject()`, igual que `CreateQuoteRiskDto.riskAttributeValue`) --
   * la validación de campos requeridos queda del lado del formulario
   * dinámico del frontend, mismo criterio que cotización.
   */
  async addRisk(ideContract: string, dto: AddRiskDto, actor: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }

    const tstSupplement = new Date(dto.tstSupplement);

    await this.prisma.$transaction(
      async (tx) => {
        const { contractFile, planProductRisk } = await this.validateAddRisk(
          ideContract,
          existing.IdeProduct,
          dto.ideContractFile,
          dto.idePlanProductRisk,
          tstSupplement,
          tx,
        );

        const codOperation = await this.resolveOperationCodeByEndorsement(dto.ideProductEndorsement, tx);
        await this.createContractOperation(ideContract, existing.IdeProduct, codOperation, actor, tx);

        await this.createNewFileRisk(
          contractFile,
          planProductRisk,
          dto.desFileRisk,
          dto.riskAttributeValue,
          tstSupplement,
          actor,
          tx,
        );
      },
      { timeout: SUPPLEMENT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    return this.findOne(ideContract);
  }

  /**
   * Suplemento "Baja de riesgo" (Etapa 4): cancela TODAS las coberturas
   * activas del `TFileRisk` -- literalmente `removeCoverage` (monto a 0,
   * devolución proporcional al tiempo) repetido por cada
   * `TRiskCoverage` activa, reutilizando sus mismos helpers
   * (`validateSupplementDate`/`createSupplementMovement`/
   * `setSupplementConcepts`/`setSupplementPrime`/`activateSupplementMovement`/
   * `closeRiskCoverage`) sin ningún cambio -- y cierra el riesgo mismo
   * al final (`closeFileRisk`, mismo operativo `'Modificar'` que ya usa
   * `cancelFileRisk` en la anulación total del contrato, así que no hace
   * falta sembrar ninguna `SStateRule` nueva).
   *
   * Los recibos se generan UNA sola vez para todas las coberturas de
   * este riesgo (no uno por cobertura), mismo criterio que
   * `generateReceipts` ya usa para agrupar todos los movimientos en
   * Borrador de la operación. Si el riesgo no tiene ninguna cobertura
   * activa (ya vacío, o recién creado con `addRisk`), se saltea
   * directamente al cierre del `TFileRisk` sin generar nada.
   */
  async removeRisk(ideContract: string, dto: RemoveRiskDto, actor: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }

    const tstSupplement = new Date(dto.tstSupplement);

    await this.prisma.$transaction(
      async (tx) => {
        await this.validateRemoveRisk(ideContract, dto.ideFileRisk, tstSupplement, tx);

        const codOperation = await this.resolveOperationCodeByEndorsement(dto.ideProductEndorsement, tx);
        await this.createContractOperation(ideContract, existing.IdeProduct, codOperation, actor, tx);

        const ideActivo = await this.stateMachine.getStateByCode('Activo');
        const riskCoverages = await tx.tRiskCoverage.findMany({
          where: { IdeFileRisk: dto.ideFileRisk, IdeState: ideActivo },
          select: { IdeRiskCoverage: true },
        });

        const newMovementIds: string[] = [];
        for (const { IdeRiskCoverage: ideRiskCoverage } of riskCoverages) {
          const { lastMovement } = await this.validateSupplementDate(ideContract, ideRiskCoverage, tstSupplement, tx);
          if (Number(lastMovement.Amount) === 0) continue; // ya en 0 -- probablemente ya fue dada de baja antes.
          const newMovement = await this.createSupplementMovement(ideRiskCoverage, lastMovement, tstSupplement, 0, actor, tx);
          await this.setSupplementConcepts(ideRiskCoverage, lastMovement, newMovement, 0, actor, tx);
          await this.setSupplementPrime(ideRiskCoverage, newMovement.IdeCoverageMovement, 0, actor, tx);
          newMovementIds.push(newMovement.IdeCoverageMovement);
        }

        if (newMovementIds.length > 0) {
          await this.generateReceipts(ideContract, dto.ideProductEndorsement, actor, tx);
          for (const ideCoverageMovement of newMovementIds) {
            await this.activateSupplementMovement(ideCoverageMovement, actor, tx);
          }
        }
        for (const { IdeRiskCoverage: ideRiskCoverage } of riskCoverages) {
          await this.closeRiskCoverage(ideRiskCoverage, actor, tx);
        }

        await this.closeFileRisk(dto.ideFileRisk, tstSupplement, dto.desSupplement, actor, tx);
      },
      { timeout: SUPPLEMENT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    return this.findOne(ideContract);
  }

  /**
   * Listado paginado/filtrable de contratos (`GET /contracts`) -- mismo
   * patrón que `QuotesService.findAll` (ver `ListContractsDto`), pedido
   * explícito del usuario para la pantalla de listado de contratos (ver
   * docs/02-roadmap.md). Deliberadamente liviano (sin riesgos/coberturas/
   * facturación, que solo hacen falta al abrir UN contrato puntual vía
   * `findOne`).
   */
  /**
   * Campos ordenables de `GET /contracts` -- lista cerrada (no se acepta
   * cualquier `sortField` arbitrario) pedida explícita por el usuario
   * ("con el componente de PrimeNG"), mismas columnas que la tabla del
   * frontend (ver `ContractsListComponent`). Deliberadamente SIN
   * `desInitialChannel` (canal inicial) -- ese valor se resuelve con una
   * consulta aparte después de paginar (ver más abajo, mismo motivo que
   * `enrichDistributionChannels` en `findOne`: `IdeDistributionChannel`
   * no tiene relación de Prisma), así que no hay un `orderBy` de Prisma
   * posible para esa columna sin traer TODOS los contratos a memoria
   * primero -- se deja sin ordenar en vez de pagar ese costo.
   */
  private static readonly SORTABLE_FIELDS: Record<
    string,
    (dir: Prisma.SortOrder) => Prisma.TContractOrderByWithRelationInput
  > = {
    numContract: (dir) => ({ NumContract: dir }),
    desProduct: (dir) => ({ SProduct: { DesProduct: dir } }),
    tstInitial: (dir) => ({ TstInitial: dir }),
    tstEnd: (dir) => ({ TstEnd: dir }),
    tstSubscription: (dir) => ({ TstSubscription: dir }),
    contractAge: (dir) => ({ ContractAge: dir }),
    desValidityType: (dir) => ({ SValidityType: { DesValidityType: dir } }),
    desPaymentFraction: (dir) => ({ SPaymentFraction: { DesPaymentFraction: dir } }),
    desState: (dir) => ({ SState: { DesState: dir } }),
  };

  private resolveOrderBy(query: ListContractsDto): Prisma.TContractOrderByWithRelationInput {
    const factory = query.sortField ? ContractsService.SORTABLE_FIELDS[query.sortField] : undefined;
    if (!factory) return { TstCreation: 'desc' };
    return factory(query.sortOrder === -1 ? 'desc' : 'asc');
  }

  async findAll(query: ListContractsDto, actor: string) {
    const [ideProduct, ideState] = await Promise.all([
      query.codProduct ? this.resolveProduct(query.codProduct) : undefined,
      query.codState ? this.resolveState(query.codState) : undefined,
    ]);

    const where: Prisma.TContractWhereInput = {
      ...(query.all ? {} : { UsrCreation: actor }),
      ...(ideProduct ? { IdeProduct: ideProduct } : {}),
      ...(ideState ? { IdeState: ideState } : {}),
      ...(query.filterNumContract ? { NumContract: { contains: query.filterNumContract, mode: 'insensitive' } } : {}),
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
      this.prisma.tContract.findMany({
        where,
        include: {
          SProduct: true,
          SState: true,
          SValidityType: true,
          SPaymentFraction: true,
        },
        orderBy: this.resolveOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tContract.count({ where }),
    ]);

    const ideContracts = rows.map((row) => row.IdeContract);
    const mainChannelByContract = await this.resolveMainChannels(ideContracts);

    return {
      items: rows.map((row) => ({
        ideContract: row.IdeContract,
        numContract: row.NumContract,
        desProduct: row.SProduct.DesProduct,
        desInitialChannel: mainChannelByContract.get(row.IdeContract) ?? null,
        tstInitial: row.TstInitial,
        tstEnd: row.TstEnd,
        tstSubscription: row.TstSubscription,
        desValidityType: row.SValidityType.DesValidityType,
        contractAge: row.ContractAge,
        desPaymentFraction: row.SPaymentFraction.DesPaymentFraction,
        codState: row.SState.CodState,
        desState: row.SState.DesState,
        /** Pedido explícito del usuario (2026-10-01): visible también en
         *  el listado general, no solo en la pantalla "Renovaciones" (ver
         *  `findRenewalCandidates`) -- un operador que entra directo al
         *  listado de contratos también necesita ver la marca. */
        indNoRenovar: row.IndNoRenovar,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * "Canal inicial" del listado -- el `TContractDistributionChannel` con
   * `IndMain=true` de cada contrato (hoy siempre hay uno solo por
   * contrato, `NumMovement=1`, ver `setContractDistributionChannel`),
   * resuelto en lote para toda la página en vez de una consulta por
   * fila. Mismo motivo que `enrichDistributionChannels` en `findOne`:
   * `IdeDistributionChannel` no tiene relación de Prisma generada.
   */
  private async resolveMainChannels(ideContracts: string[]): Promise<Map<string, string | null>> {
    if (ideContracts.length === 0) return new Map();
    const mainChannels = await this.prisma.tContractDistributionChannel.findMany({
      where: { IdeContract: { in: ideContracts }, IndMain: true },
    });
    const ideDistributionChannels = mainChannels.map((c) => c.IdeDistributionChannel);
    const channels = ideDistributionChannels.length
      ? await this.prisma.sDistributionChannel.findMany({ where: { IdeDistributionChannel: { in: ideDistributionChannels } } })
      : [];
    const channelDescById = new Map(channels.map((c) => [c.IdeDistributionChannel, c.DesDistributionChannel]));
    return new Map(mainChannels.map((c) => [c.IdeContract, channelDescById.get(c.IdeDistributionChannel) ?? null]));
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

  /**
   * `GET /contracts/:id` -- pantalla de detalle de contrato (ver
   * docs/02-roadmap.md, pendiente cerrado a pedido explícito del
   * usuario). Además de producto/riesgos/coberturas (ya existente),
   * ahora también incluye personas (`TContractPerson`, para mostrar
   * Tomador/Titular igual que el Resumen de la cotización) y
   * facturación/recibos (`TContractBilling`/`TReceipt`) -- decisión
   * explícita del usuario (opción "Completo" sobre las 3 alternativas
   * planteadas): sin esto, la pantalla de detalle no podría mostrar el
   * estado real de facturación de la póliza, que es justamente lo que
   * el usuario ya había verificado a mano por SQL (`TReceipt.Prime`) al
   * probar el motor de recargos/descuentos (ver el ítem de Fase 3).
   */
  async findOne(ideContract: string) {
    const contract = await this.prisma.tContract.findUnique({
      where: { IdeContract: ideContract },
      include: {
        SProduct: { include: { SCurrency: true } },
        SValidityType: true,
        SPaymentFraction: true,
        SState: true,
        TContractPerson: { include: { TPerson: true, SPersonRol: true, SState: true } },
        TContractBilling: { include: { SState: true }, orderBy: { NumPeriod: 'asc' } },
        TReceipt: { include: { SReceiptType: true, SState: true }, orderBy: { TstIssue: 'asc' } },
        /**
         * `IdeDistributionChannel` no tiene relación de Prisma generada
         * (la introspección no encontró un FK real en la BD para esa
         * columna, solo el índice -- confirmado, ver `enrichDistributionChannels`
         * más abajo) -- se resuelve aparte, a mano, después de esta query.
         */
        TContractDistributionChannel: { include: { SState: true } },
        /**
         * "Movimientos/Operaciones" del contrato (alta, anulación, futuros
         * endosos/suplementos) -- equivalente a la pestaña "Movimiento" del
         * backoffice viejo, que en realidad mostraba `TContractOperation`
         * (no `TCoverageMovement`, que es la prima de una cobertura y ya
         * se muestra dentro de cada riesgo). `SOperationProduct.SOperation`
         * da el tipo de operación (`DesOperation`, ej. "Alta"/"Anulación").
         */
        TContractOperation: {
          include: {
            SState: true,
            SOperationProduct: { include: { SOperation: true, SProcess: true } },
            TContractOperationDocument: { include: { SState: true } },
          },
          orderBy: { NumOperation: 'asc' },
        },
        TContractFile: {
          include: {
            SState: true,
            /** Personas por archivo (miembros de un colectivo) -- hoy
             *  vacío en la práctica (esta fase no crea contratos
             *  colectivos reales, ver el comentario de cabecera de
             *  `create()`), pero se incluye para que la pantalla ya
             *  quede lista cuando se aborden. */
            TContractFilePerson: { include: { TPerson: true, SPersonRol: true } },
            TFileRisk: {
              include: {
                SRiskProduct: true,
                /** Plan del riesgo (columna "Plan" del detalle de
                 *  contrato) -- `SPlanProductRisk` no tiene su propia
                 *  descripción, hay que bajar un nivel más a
                 *  `SPlanProduct` (`DesShort`/`DesPlanProduct`). */
                SPlanProductRisk: { include: { SPlanProduct: true } },
                SState: true,
                /** Requisitos copiados de la cotización al contratar
                 *  (ver `copyRisksAndCoverages`) -- por riesgo y,
                 *  opcionalmente, por cobertura puntual dentro del riesgo. */
                /** Requisitos copiados de la cotización al contratar
                 *  (ver `copyRisksAndCoverages`) -- por riesgo y,
                 *  opcionalmente, por cobertura puntual dentro del riesgo.
                 *  `FileData` (bytea, Etapa 2) viaja en esta consulta
                 *  porque `include` no permite excluir columnas
                 *  escalares -- se quita a mano más abajo, justo antes
                 *  de devolver el contrato (restringir acá con `select`
                 *  rompía la inferencia de tipos del genérico de
                 *  `enrichDistributionChannels`, un problema conocido de
                 *  Prisma con árboles de `include` profundos). */
                TContractRequirement: {
                  include: { SProductRequirement: { include: { SRequirement: true } }, SState: true },
                },
                /** Columnas monto/tasa/prima leen los escalares propios de
                 *  `TRiskCoverage` (`Amount`/`Rate`/`Prime`), no
                 *  `TCoverageMovement` -- confirmado que `Prime` ya llega
                 *  descontado/recargado desde `TQuoteCoverage` al
                 *  contratar (ver `copyRisksAndCoverages`), así que no
                 *  hace falta agregar movimientos acá. */
                TRiskCoverage: {
                  include: { SCoveragePlan: true, SState: true },
                },
              },
            },
          },
        },
      },
    });
    if (!contract) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }
    // `FileData` (bytea, Etapa 2 de Requisitos) no tiene sentido mandarlo
    // en cada fila del detalle del contrato -- se descarga aparte por
    // `ContractRequirementsController.downloadFile`. `DesFileName` se
    // deja (si no es null, hay archivo cargado).
    for (const file of contract.TContractFile) {
      for (const risk of file.TFileRisk) {
        for (const requirement of risk.TContractRequirement) {
          delete (requirement as { FileData?: unknown }).FileData;
        }
      }
    }
    return this.enrichDistributionChannels(contract);
  }

  /**
   * `TContractDistributionChannel.IdeDistributionChannel` -- ver el
   * comentario de `findOne`, sin relación de Prisma generada. Se resuelve
   * con una consulta aparte y se mezcla a mano, mismo criterio que
   * cualquier "resolve" manual ya usado en este servicio/`QuotesService`
   * (`resolveProduct`/`resolveState`), solo que acá es la dirección
   * inversa (de id a descripción, no de código a id).
   */
  private async enrichDistributionChannels<
    T extends { TContractDistributionChannel: Array<{ IdeDistributionChannel: string }> },
  >(contract: T) {
    const ideDistributionChannels = contract.TContractDistributionChannel.map((c) => c.IdeDistributionChannel);
    const channels = ideDistributionChannels.length
      ? await this.prisma.sDistributionChannel.findMany({ where: { IdeDistributionChannel: { in: ideDistributionChannels } } })
      : [];
    const channelById = new Map(channels.map((channel) => [channel.IdeDistributionChannel, channel]));
    return {
      ...contract,
      TContractDistributionChannel: contract.TContractDistributionChannel.map((c) => ({
        ...c,
        SDistributionChannel: channelById.get(c.IdeDistributionChannel) ?? null,
      })),
    };
  }

  /**
   * Acción "Renovar contrato" (backlog item 2, ver docs/02-roadmap.md) --
   * a diferencia de Contratar/Anular/Activar, ACÁ NO HAY una función
   * `FContract` legado que replicar: la renovación nunca se implementó en
   * el sistema original (confirmado contra
   * docs/01-especificacion-motor-negocio-actual.md, que documenta las 44
   * funciones PL/pgSQL reales y ninguna cubre esto). Es diseño nuevo,
   * decidido junto con el usuario (2026-09-29):
   *
   * - Renovar EXTIENDE el mismo `TContract` (mismo `IdeContract`,
   *   `NumContract`) en vez de crear uno nuevo -- el schema no tiene forma
   *   de crear un contrato sin una `TQuote` de origen propia (obligatoria
   *   y 1 a 1), y no hay necesidad real de cotizar de nuevo algo que ya
   *   está contratado.
   * - La prima de cada cobertura se RECALCULA con el motor de reglas
   *   vigente (`RulesEngineService`, mismo motor que cotización y
   *   contratación) -- no se prorroga el monto anterior tal cual.
   * - El nuevo movimiento de cada cobertura usa la MISMA fórmula que el
   *   "movimiento inicial" de `createInitialMovements`/`setNetPrime`
   *   (proporcional según fracción de pago), en vez de encadenarse a la
   *   rama de "ya existe un movimiento anterior" de `setNetPrime` -- esa
   *   rama nunca se llegó a ejecutar ni una sola vez (`create()` solo
   *   genera un movimiento inicial por cobertura) y depende de encontrar
   *   un `TContractBilling` en estado Activo, que HOY NUNCA EXISTE
   *   (`TContractBilling` está seedeado "sin transición", mismo gap que
   *   `TContractPerson` tenía -- ver `activateContractPersons`). Decisión
   *   explícita del usuario: no tocar `setNetPrime` (código compartido
   *   con `create()`/`cancel()`, ya de por sí frágil) para resolver esto
   *   -- una renovación es un período nuevo, no la continuación del
   *   anterior, así que la fórmula proporcional es semánticamente
   *   correcta igual.
   * - CORREGIDO 2026-09-30 (encontrado por el usuario al probar en
   *   pantalla): SÍ se crea una `TContractOperation` propia para la
   *   renovación (`'RENOVGENE'`, catálogo nuevo -- ver
   *   `packages/database/scripts/setup-renewal-operation-catalog.js`),
   *   ANTES de `generateReceipts`, mismo orden que los suplementos
   *   (`changeInsuredAmount`/`addCoverage`/etc: primero su propia
   *   operación, después `RECEGENE`) -- así queda con 2 operaciones como
   *   cualquier otro suplemento, en vez de 1 sola apuntando al proceso de
   *   Contratación. La primera versión de este método NO creaba esta
   *   operación (asumiendo que el cálculo de tipo de recibo por
   *   `NumOperation` de `generateReceipts` iba a resolver solo a `'REN'`)
   *   -- resultó ser una suposición incorrecta, nunca verificada contra
   *   un contrato real: cualquier contrato con al menos un suplemento
   *   previo ya tiene `NumOperation>2` de por sí, así que ese cálculo
   *   siempre da `'SUP'` (mismo defecto ya documentado para anulación).
   *   Por eso `generateReceipts` ahora recibe `forceReceiptTypeCode='REN'`
   *   acá -- fija el tipo directamente en vez de depender de ese cálculo.
   * - Se registra un `TContractRenewalCycle` por cada renovación (tabla
   *   nueva, ver
   *   `packages/database/scripts/setup-contract-renewal-cycle-table.js`)
   *   como historial de cuándo se renovó y desde qué vencimiento. El
   *   opt-out manual ya existe (`IndNoRenovar`, Etapa 2). El aviso
   *   automático por email (Etapa 3, `RenewalNoticeJobHandler`) NO usa
   *   esta tabla -- se resuelve con `TContract.TstRenewalNoticeSent`
   *   (ver `setup-renewal-notice-column.js`), limpiada acá abajo a
   *   `null` para que el próximo ciclo dispare un aviso nuevo.
   *
   * Solo se puede renovar un contrato Activo con `TstEnd` definido y que
   * esté dentro de `MANUAL_RENEWAL_WINDOW_DAYS` días de su vencimiento (o
   * ya vencido) -- fuera de esa ventana se rechaza con `ConflictException`
   * para evitar renovar por error un contrato recién contratado. El
   * nuevo período dura lo mismo que el anterior (`TstEnd - TstInitial`
   * actual), y `ContractAge` se incrementa en 1 -- fórmula de incremento
   * que había quedado deliberadamente sin confirmar en `create()` (no hay
   * fuente legado que replicar) y se fija acá por primera vez.
   */
  async renew(ideContract: string, actor: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    if (existing.IdeState !== ideActivo) {
      throw new ConflictException(`El contrato "${ideContract}" debe estar "Activo" para poder renovarse`);
    }
    if (!existing.TstEnd) {
      throw new ConflictException(
        `El contrato "${ideContract}" no tiene fecha de vencimiento definida -- no se puede renovar`,
      );
    }
    const daysUntilExpiry = daysBetween(new Date(), existing.TstEnd);
    if (daysUntilExpiry > MANUAL_RENEWAL_WINDOW_DAYS) {
      throw new ConflictException(
        `El contrato "${ideContract}" vence el ${existing.TstEnd.toISOString().slice(0, 10)} -- ` +
          `todavía faltan más de ${MANUAL_RENEWAL_WINDOW_DAYS} días, no se puede renovar todavía`,
      );
    }

    const durationMs = existing.TstEnd.getTime() - existing.TstInitial.getTime();
    const newTstInitial = existing.TstEnd;
    const newTstEnd = new Date(newTstInitial.getTime() + durationMs);
    const tstTrigger = existing.TstEnd;

    await this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        await tx.tContract.update({
          where: { IdeContract: ideContract },
          data: {
            TstInitial: newTstInitial,
            TstEnd: newTstEnd,
            ContractAge: { increment: 1 },
            // Nuevo ciclo de renovación -- limpia el aviso por email del
            // ciclo anterior (ver RenewalNoticeJobHandler) para que el
            // PRÓXIMO vencimiento dispare un aviso nuevo.
            TstRenewalNoticeSent: null,
            UsrModification: actor,
            TstModification: now,
          },
        });

        // Operación propia de la renovación (igual que los suplementos:
        // primero SU operación, después RECEGENE) -- requiere
        // packages/database/scripts/setup-renewal-operation-catalog.js
        // ya corrido (SOperation "RENOVGENE" + SOperationProduct bajo el
        // SProcess "RENOVACION" ya existente).
        await this.createContractOperation(ideContract, existing.IdeProduct, 'RENOVGENE', actor, tx);

        const files = await tx.tContractFile.findMany({
          where: { IdeContract: ideContract, IdeState: ideActivo },
        });
        for (const file of files) {
          await tx.tContractFile.update({
            where: { IdeContractFile: file.IdeContractFile },
            data: { TstInitial: newTstInitial, TstEnd: newTstEnd, UsrModification: actor, TstModification: now },
          });
          await this.renewContractFile(file.IdeContractFile, existing.IdeProduct, newTstInitial, newTstEnd, actor, tx);
        }

        const lastPeriod = await tx.tContractBilling.findFirst({
          where: { IdeContract: ideContract },
          orderBy: { NumPeriod: 'desc' },
          select: { NumPeriod: true },
        });
        await this.setContractBilling(
          {
            IdeContract: ideContract,
            TstInitial: newTstInitial,
            TstEnd: newTstEnd,
            IdePaymentFraction: existing.IdePaymentFraction,
          },
          actor,
          tx,
          (lastPeriod?.NumPeriod ?? 0) + 1,
        );

        // 'REN' fijo -- ver doc-comment de generateReceipts: el cálculo
        // genérico por NumOperation es inalcanzable en la práctica para
        // un contrato que ya tuvo algún suplemento antes de renovarse.
        await this.generateReceipts(ideContract, null, actor, tx, 'REN');

        await tx.tContractRenewalCycle.create({
          data: {
            IdeContract: ideContract,
            TstTrigger: tstTrigger,
            TstRenewed: now,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });
      },
      { timeout: SUPPLEMENT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    return this.findOne(ideContract);
  }

  /**
   * Renueva un `TContractFile`: extiende la vigencia de sus `TFileRisk`/
   * `TRiskCoverage` activos al nuevo período, y genera un
   * `TCoverageMovement` nuevo por cobertura con la prima recalculada --
   * ver el doc-comment de `renew()` para el porqué de la fórmula usada
   * (la del "movimiento inicial" de `createInitialMovements`/
   * `setNetPrime`, no la rama de continuación de `setNetPrime`).
   */
  private async renewContractFile(
    ideContractFile: string,
    ideProduct: string,
    newTstInitial: Date,
    newTstEnd: Date,
    actor: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();

    const contractFile = await tx.tContractFile.findUniqueOrThrow({
      where: { IdeContractFile: ideContractFile },
      select: { IdeContract: true },
    });
    const contract = await tx.tContract.findUniqueOrThrow({
      where: { IdeContract: contractFile.IdeContract },
      select: { IdePaymentFraction: true },
    });
    const product = await tx.sProduct.findFirst({
      where: { IdeProduct: ideProduct, TstInitial: { lte: now }, TstEnd: { gte: now }, IdeState: ideActivo },
    });
    if (!product) {
      throw new ConflictException(
        'No se pudo renovar: no hay configuración vigente de "SProduct" para este producto.',
      );
    }
    if (!product.IndProportionalPrime) {
      // Ver doc-comment de `renew()`: la renovación solo soporta el
      // cálculo proporcional (default del esquema) -- el cálculo por días
      // exactos depende de `TContractBilling` estar Activo, que hoy nunca
      // pasa (mismo gap de `TContractPerson`, deliberadamente no resuelto
      // acá).
      throw new ConflictException(
        'No se pudo renovar: este producto no usa prima proporcional ("IndProportionalPrime=false") -- la renovación todavía no soporta el cálculo por días exactos.',
      );
    }
    const productPaymentFraction = await tx.sProductPaymentFraction.findFirst({
      where: {
        IdeProduct: ideProduct,
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
    if (!productPaymentFraction || !paymentFraction) {
      throw new ConflictException(
        'No se pudo renovar: falta configuración vigente de fracción de pago para este producto.',
      );
    }
    const porSurcharge = Number(productPaymentFraction.PorSurCharge);
    const numFraction = paymentFraction.NumFraction;

    const [ideMovementInitial, ideMovementConceptInitial, primaTotalConcept] = await Promise.all([
      this.stateMachine.getInitialState('TCoverageMovement'),
      this.stateMachine.getInitialState('TMovementConcept'),
      tx.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' } }),
    ]);

    const fileRisks = await tx.tFileRisk.findMany({
      where: { IdeContractFile: ideContractFile, IdeState: ideActivo },
    });
    for (const fileRisk of fileRisks) {
      await tx.tFileRisk.update({
        where: { IdeFileRisk: fileRisk.IdeFileRisk },
        data: { TstInitial: newTstInitial, TstEnd: newTstEnd, UsrModification: actor, TstModification: now },
      });

      const riskCoverages = await tx.tRiskCoverage.findMany({
        where: { IdeFileRisk: fileRisk.IdeFileRisk, IdeState: ideActivo },
      });
      for (const riskCoverage of riskCoverages) {
        await tx.tRiskCoverage.update({
          where: { IdeRiskCoverage: riskCoverage.IdeRiskCoverage },
          data: { TstInitial: newTstInitial, TstEnd: newTstEnd, UsrModification: actor, TstModification: now },
        });

        const lastMovement = await tx.tCoverageMovement.findFirst({
          where: { IdeRiskCoverage: riskCoverage.IdeRiskCoverage },
          orderBy: { NumCoverageMovement: 'desc' },
          select: { NumCoverageMovement: true },
        });
        const nextNum = (lastMovement?.NumCoverageMovement ?? 0) + 1;

        const movement = await tx.tCoverageMovement.create({
          data: {
            IdeRiskCoverage: riskCoverage.IdeRiskCoverage,
            NumCoverageMovement: nextNum,
            TstInitial: newTstInitial,
            TstEnd: newTstEnd,
            Amount: riskCoverage.Amount,
            Rate: riskCoverage.Rate,
            Prime: 0,
            IdeState: ideMovementInitial,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });

        const rules = await this.rulesEngine.getApplicableRules({
          ideProduct,
          idePlanProductRisk: fileRisk.IdePlanProductRisk,
          ideCoveragePlan: riskCoverage.IdeCoveragePlan,
        });
        const results = await this.rulesEngine.evaluateChain(rules, {
          origin: 'Contract',
          ideOriginRisk: fileRisk.IdeFileRisk,
          ideCoverageOrMovement: movement.IdeCoverageMovement,
          dbTransaction: tx,
        });

        for (const result of results) {
          if (result.columnName) continue; // ver createInitialMovements: sin columnas dinámicas equivalentes acá.
          const grossValue = Number(result.value);
          const netValue = grossValue / numFraction + (grossValue / numFraction) * (porSurcharge / 100);
          await tx.tMovementConcept.create({
            data: {
              IdeCoverageMovement: movement.IdeCoverageMovement,
              IdeConcept: result.ideConcept,
              ConceptValue: result.value,
              ConceptNetValue: netValue,
              IdeState: ideMovementConceptInitial,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            },
          });
        }

        let primeNet = 0;
        let primeGross = 0;
        if (primaTotalConcept) {
          const primaTotalRow = await tx.tMovementConcept.findFirst({
            where: { IdeCoverageMovement: movement.IdeCoverageMovement, IdeConcept: primaTotalConcept.IdeConcept },
          });
          if (primaTotalRow) {
            primeNet = round2(Number(primaTotalRow.ConceptNetValue));
            primeGross = round2(Number(primaTotalRow.ConceptValue));
          }
        }
        await tx.tCoverageMovement.update({
          where: { IdeCoverageMovement: movement.IdeCoverageMovement },
          data: { Prime: primeNet, UsrModification: actor, TstModification: now },
        });
        await tx.tRiskCoverage.update({
          where: { IdeRiskCoverage: riskCoverage.IdeRiskCoverage },
          data: { Prime: primeGross, UsrModification: actor, TstModification: now },
        });
      }
    }
  }

  /**
   * Candidatos a renovar (Etapa 2 de "Gestión de renovaciones", pantalla
   * "Renovaciones", ver docs/02-roadmap.md): contratos Activos cuyo
   * `TstEnd` cae dentro de los próximos `RENEWAL_CANDIDATE_WINDOW_DAYS`
   * días (variable de entorno, default 60 si no está seteada -- pedido
   * explícito del usuario que viva en `.env` en vez de una constante en
   * código, a diferencia de `MANUAL_RENEWAL_WINDOW_DAYS` de la Etapa 1).
   * Ya vencidos NO entran acá (esta pantalla es para anticiparse, no
   * para gestionar morosidad). Incluye los que YA están marcados
   * `IndNoRenovar=true` -- el operador tiene que poder ver y deshacer
   * esa marca desde la misma pantalla, no solo ponerla.
   *
   * Trae el Titular (si existe) para que el operador pueda identificar
   * la póliza sin tener que abrir cada contrato -- mismo criterio que
   * `findOne`, pero acá solo el nombre, no el objeto completo.
   */
  async findRenewalCandidates(query: ListRenewalCandidatesDto) {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const windowDays = Number(process.env.RENEWAL_CANDIDATE_WINDOW_DAYS ?? '60');
    const windowEnd = addDays(now, windowDays);

    const where: Prisma.TContractWhereInput = {
      IdeState: ideActivo,
      TstEnd: { gte: now, lte: windowEnd },
    };

    const [rows, total] = await Promise.all([
      this.prisma.tContract.findMany({
        where,
        include: {
          SProduct: { select: { DesProduct: true } },
          TContractPerson: {
            where: { SPersonRol: { CodPersonRol: 'TITULAR' } },
            include: { TPerson: { select: { DesFirstName: true, DesLastName1: true } } },
          },
        },
        orderBy: { TstEnd: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tContract.count({ where }),
    ]);

    return {
      items: rows.map((row) => {
        const titular = row.TContractPerson[0]?.TPerson;
        return {
          ideContract: row.IdeContract,
          numContract: row.NumContract,
          desProduct: row.SProduct.DesProduct,
          desTitular: titular ? [titular.DesFirstName, titular.DesLastName1].filter(Boolean).join(' ') : null,
          tstEnd: row.TstEnd,
          contractAge: row.ContractAge,
          indNoRenovar: row.IndNoRenovar,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Marca o desmarca "No renovar" sobre un contrato puntual (Etapa 2,
   * pantalla "Renovaciones") -- decisión del operador de que ESTE
   * contrato en particular no se renueve automáticamente al vencer (ej.
   * no rentable para la compañía). Solo cambia el flag -- no cancela ni
   * toca ningún otro dato del contrato. La Etapa 3 (cron de renovación
   * automática, todavía no implementado) va a filtrar por
   * `IndNoRenovar=false` antes de renovar; esta acción manual
   * (`renew()`) deliberadamente NO lo valida -- marcar "no renovar" no
   * debería impedirle a un operador renovar a mano si igual lo necesita.
   */
  async setRenewalOptOut(ideContract: string, noRenovar: boolean, actor: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }
    await this.prisma.tContract.update({
      where: { IdeContract: ideContract },
      data: { IndNoRenovar: noRenovar, UsrModification: actor, TstModification: new Date() },
    });
    return { ideContract, indNoRenovar: noRenovar };
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
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const productValidityType = await tx.sProductValidityType.findFirst({
      where: { IdeProduct: quote.IdeProduct },
      select: { IdeValidityType: true },
    });
    if (!productValidityType) {
      throw new NotFoundException(`El producto "${quote.IdeProduct}" no tiene un tipo de vigencia configurado`);
    }

    const idePaymentFraction = await this.resolvePaymentFraction(quote.IdeProduct, dto.codPaymentFraction, tx);
    const [ideContractInitial, numContract] = await Promise.all([
      this.stateMachine.getInitialState('TContract'),
      this.generateNumContract(tx),
    ]);

    const now = new Date();
    const tstInitial = dto.initialDate ? new Date(dto.initialDate) : now;
    const tstEnd = new Date(tstInitial);
    tstEnd.setFullYear(tstEnd.getFullYear() + 1); // ver comentario de cabecera: placeholder confirmado igual al original para tipos de vigencia no anuales.

    return tx.tContract.create({
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
  private async generateNumContract(tx: Prisma.TransactionClient = this.prisma): Promise<string> {
    const result = await tx.$queryRaw<{ nextval: number }[]>`
      SELECT nextval('ars_platform."SeqTContractNumber"')::int AS nextval
    `;
    const year = new Date().getFullYear();
    return `CONT-${year}-${result[0].nextval}`;
  }

  private async resolvePaymentFraction(
    ideProduct: string,
    codPaymentFraction: string | undefined,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    if (codPaymentFraction) {
      const row = await tx.sProductPaymentFraction.findFirst({
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

    const productFractions = await tx.sProductPaymentFraction.findMany({
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
   *
   * `IndLead`/`IndClient` son mutuamente excluyentes -- pedido explícito
   * del usuario (2026-10-02, al notar una persona con ambas banderas en
   * `true` tras contratar): esta función también apaga `IndLead` en el
   * mismo `update`. Corrección de los datos ya afectados antes de este
   * cambio vía `packages/database/scripts/fix-person-lead-client-flags.js`.
   */
  /**
   * Requisito de negocio agregado explícitamente por el usuario (no
   * exigido por ningún `FContract` original -- el legado no validaba
   * esto): Tomador y Titular deben tener al menos una dirección activa
   * (`TAddress`) y al menos un dato de contacto activo de clase
   * `MOBILE_PHONE` (`TContactData`/`SContactClass`, código real
   * confirmado explícitamente con el usuario) antes de poder generar el
   * contrato -- decisión explícita: bloquear tanto en el frontend
   * (`QuotesComponent`, botón "Generar contrato" deshabilitado) COMO
   * acá, para que un llamado directo a la API no pueda saltarse el
   * requisito. Mismo criterio de roles que `setContractPersons`
   * (`SPersonRol.CodPersonRol` en `TOMADOR`/`TITULAR`) -- si la
   * cotización todavía no tiene ninguna persona asociada a esos roles,
   * no valida nada acá (se comporta igual que `setContractPersons`, que
   * tampoco falla en ese caso -- no es un requisito nuevo introducir esa
   * validación).
   */
  private async assertPersonsReadyForIssuance(ideQuote: string): Promise<void> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const quotePersons = await this.prisma.tQuotePerson.findMany({
      where: { IdeQuote: ideQuote, SPersonRol: { CodPersonRol: { in: ['TOMADOR', 'TITULAR'] } } },
      include: { SPersonRol: true, TPerson: { select: { DesFirstName: true } } },
    });

    const missing: string[] = [];
    for (const quotePerson of quotePersons) {
      const [addressCount, mobilePhoneCount] = await Promise.all([
        this.prisma.tAddress.count({
          where: { IdePerson: quotePerson.IdePerson, IdeState: activeStateId },
        }),
        this.prisma.tContactData.count({
          where: {
            IdePerson: quotePerson.IdePerson,
            IdeState: activeStateId,
            SContactClass: { CodContactClass: 'MOBILE_PHONE' },
          },
        }),
      ]);
      const personLabel = `${quotePerson.TPerson.DesFirstName} (${quotePerson.SPersonRol.CodPersonRol})`;
      if (addressCount === 0) missing.push(`${personLabel}: falta dirección`);
      if (mobilePhoneCount === 0) missing.push(`${personLabel}: falta teléfono móvil`);
    }

    if (missing.length > 0) {
      throw new ConflictException(
        `No se puede generar el contrato -- faltan datos obligatorios: ${missing.join('; ')}`,
      );
    }
  }

  private async setContractPersons(
    ideQuote: string,
    ideContract: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const quotePersons = await tx.tQuotePerson.findMany({
      where: { IdeQuote: ideQuote, SPersonRol: { CodPersonRol: { in: ['TOMADOR', 'TITULAR'] } } },
    });
    if (quotePersons.length === 0) return;

    const ideContractPersonInitial = await this.stateMachine.getInitialState('TContractPerson');
    const now = new Date();

    for (const quotePerson of quotePersons) {
      await tx.tContractPerson.create({
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
      await tx.tPerson.update({
        where: { IdePerson: quotePerson.IdePerson },
        // `IndLead: false` agregado a pedido explícito del usuario
        // (2026-10-02): Lead y Cliente son mutuamente excluyentes -- un
        // prospecto nace `IndLead=true`/`IndClient=false` (ver
        // `PersonsService.create`) y deja de ser "lead" en el mismo
        // instante en que se convierte en cliente (este `update`), no
        // antes. Si más adelante esta misma persona ya cliente genera
        // una cotización nueva, se queda como cliente (no vuelve a
        // marcarse `IndLead=true`) -- mismo criterio que cualquier CRM:
        // un cliente con una cotización en curso sigue siendo cliente,
        // no "prospecto" otra vez.
        data: { IndClient: true, IndLead: false, TstRelationshipStart: now, UsrModification: actor, TstModification: now },
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
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const ideStateInitial = await this.stateMachine.getInitialState('TContractDistributionChannel');
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const tstEnd = contract.TstEnd ?? contract.TstInitial;

    const splitConfig = await tx.sCommissionProduct.findMany({
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
      await tx.tContractDistributionChannel.create({
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
    tx: Prisma.TransactionClient = this.prisma,
    startPeriod = 1,
  ): Promise<void> {
    const paymentFraction = await tx.sPaymentFraction.findUniqueOrThrow({
      where: { IdePaymentFraction: contract.IdePaymentFraction },
    });
    const ideStateInitial = await this.stateMachine.getInitialState('TContractBilling');
    const now = new Date();

    const start = contract.TstInitial.getTime();
    const end = (contract.TstEnd ?? contract.TstInitial).getTime();
    const numFraction = Math.max(paymentFraction.NumFraction, 1);
    const periodMs = (end - start) / numFraction;

    // `startPeriod` (default 1) permite continuar la numeración de
    // `NumPeriod` en vez de reiniciarla en 1 -- lo usa `renew()` para no
    // colisionar con los períodos del ciclo de vigencia anterior
    // (`@@unique([IdeContract, NumPeriod])`, mismo contrato para siempre).
    const periods = Array.from({ length: numFraction }, (_, index) => ({
      IdeContract: contract.IdeContract,
      NumPeriod: startPeriod + index,
      TstInitial: new Date(start + periodMs * index),
      TstEnd: new Date(start + periodMs * (index + 1)),
      IdeState: ideStateInitial,
      UsrCreation: actor,
      TstCreation: now,
      UsrModification: actor,
      TstModification: now,
    }));
    await tx.tContractBilling.createMany({ data: periods });
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
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideStateInitial = await this.stateMachine.getInitialState('TContractFile');
    const now = new Date();
    return tx.tContractFile.create({
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
  private async createInitialContractOperation(
    ideContract: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const contract = await tx.tContract.findUniqueOrThrow({ where: { IdeContract: ideContract } });
    return this.createContractOperation(ideContract, contract.IdeProduct, 'CONTGENE', actor, tx);
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
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const quoteRisks = await tx.tQuoteRisk.findMany({
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
    const contractFile = await tx.tContractFile.findUniqueOrThrow({
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

      const fileRisk = await tx.tFileRisk.create({
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

      const idePlanProduct = (
        await tx.sPlanProductRisk.findUnique({ where: { IdePlanProductRisk: selectedPlan.IdePlanProductRisk } })
      )?.IdePlanProduct ?? null;
      await this.requirementsService.resolveContractRequirementsForRisk(
        {
          ideFileRisk: fileRisk.IdeFileRisk,
          ideRiskProduct: quoteRisk.IdeRiskProduct,
          idePlanProduct,
          ideProduct,
          actor,
        },
        tx,
      );

      for (const requirement of quoteRisk.TQuoteRequirement.filter((r) => !r.IdeQuoteCoverage)) {
        await tx.tContractRequirement.create({
          data: {
            IdeFileRisk: fileRisk.IdeFileRisk,
            IdeProductRequirement: requirement.IdeProductRequirement,
            Data: requirement.Data ?? undefined,
            // Si el Tomador/Titular ya subió el archivo al cotizar
            // (Etapa 2 de Requisitos), se copia junto con el resto --
            // no tiene sentido pedirlo de nuevo al contratar.
            FileData: requirement.FileData ?? undefined,
            DesFileName: requirement.DesFileName ?? undefined,
            IdeState: ideContractRequirementInitial,
            UsrCreation: actor,
            TstCreation: now,
            UsrModification: actor,
            TstModification: now,
          },
        });
      }

      for (const coverage of selectedPlan.TQuoteCoverage) {
        const riskCoverage = await tx.tRiskCoverage.create({
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

        await this.requirementsService.resolveContractRequirementsForCoverage(
          {
            ideFileRisk: fileRisk.IdeFileRisk,
            ideRiskCoverage: riskCoverage.IdeRiskCoverage,
            ideRiskProduct: quoteRisk.IdeRiskProduct,
            idePlanProduct,
            ideCoveragePlan: coverage.IdeCoveragePlan,
            ideProduct,
            actor,
          },
          tx,
        );

        const coverageRequirements = quoteRisk.TQuoteRequirement.filter(
          (r) => r.IdeQuoteCoverage === coverage.IdeQuoteCoverage,
        );
        for (const requirement of coverageRequirements) {
          await tx.tContractRequirement.create({
            data: {
              IdeFileRisk: fileRisk.IdeFileRisk,
              IdeRiskCoverage: riskCoverage.IdeRiskCoverage,
              IdeProductRequirement: requirement.IdeProductRequirement,
              Data: requirement.Data ?? undefined,
              FileData: requirement.FileData ?? undefined,
              DesFileName: requirement.DesFileName ?? undefined,
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
   * (`RulesEngineService.evaluateChain`, `origin: 'Contract'`).
   * `ConceptNetValue` queda acá igual al bruto como valor provisorio --
   * `setNetPrime` (llamado después, ver `create()`) lo recalcula de verdad.
   *
   * Importante: se le pasa `dbTransaction: tx` a `evaluateChain` (ver
   * `EvaluationContext` en `@ars-platform/shared-common`) porque
   * `TFileRisk` (leído por `AttributeValueResolver` para resolver custom
   * fields) y `TMovementConcept` (leído por `RuleValueResolver` para
   * referencias `rule('COD')` a otra cobertura) son escritos por esta MISMA
   * transacción -- sin pasar `tx`, esos resolvers leen por su propia
   * conexión Prisma no-transaccional y, bajo READ COMMITTED, no ven filas
   * que la transacción activa escribió pero todavía no confirmó (bug real
   * encontrado y corregido -- ver docs/02-roadmap.md).
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
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const [ideMovementInitial, ideMovementConceptInitial, primaTotalConcept] = await Promise.all([
      this.stateMachine.getInitialState('TCoverageMovement'),
      this.stateMachine.getInitialState('TMovementConcept'),
      tx.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' } }),
    ]);
    const now = new Date();

    for (const riskCoverage of riskCoverages) {
      const coverage = await tx.tRiskCoverage.findUniqueOrThrow({
        where: { IdeRiskCoverage: riskCoverage.ideRiskCoverage },
      });
      const movement = await tx.tCoverageMovement.create({
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
        dbTransaction: tx,
      });

      for (const result of results) {
        if (result.columnName) continue; // TCoverageMovement no expone columnas dinámicas equivalentes a Amount/Rate/Prime de TQuoteCoverage para este flujo; se ignora, mismo criterio de "no adivinar" que el resto de la clase.
        await tx.tMovementConcept.create({
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
        const primaTotalRow = await tx.tMovementConcept.findFirst({
          where: { IdeCoverageMovement: movement.IdeCoverageMovement, IdeConcept: primaTotalConcept.IdeConcept },
        });
        prime = primaTotalRow ? round2(Number(primaTotalRow.ConceptValue)) : riskCoverage.prime;
      }
      await tx.tCoverageMovement.update({
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
   *
   * Agregado 2026-09-28 (a pedido explícito del usuario, tras notar que
   * la pestaña "Movimientos" mostraba TODAS las operaciones eternamente
   * en "Borrador"): la fila nace en el estado inicial genérico
   * (Borrador, igual que antes) pero se transiciona de inmediato, en la
   * MISMA transacción, al estado final que corresponda según
   * `finalOperative` -- `'Activar'` (default, Borrador -> Activo) para
   * `CONTGENE`/`RECEGENE`, `'Anular'` (Borrador -> Anulado) para la
   * operación de anulación. Requiere las `SStateRule` correspondientes
   * (ver `packages/database/scripts/seed-contract-operation-states.js`).
   */
  private async createContractOperation(
    ideContract: string,
    ideProduct: string,
    codOperation: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
    finalOperative: 'Activar' | 'Anular' = 'Activar',
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
    const created = await tx.tContractOperation.create({
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
    const ideStateFinal = await this.stateMachine.getNextState('TContractOperation', ideStateInitial, finalOperative);
    return tx.tContractOperation.update({
      where: { IdeContractOperation: created.IdeContractOperation },
      data: { IdeState: ideStateFinal, UsrModification: actor, TstModification: now },
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
   * Nota de performance (corregido 2026-09-28): el recorrido día a día
   * es fiel al cursor del original (una fila de `TMovementConcept` por
   * día potencialmente evaluada), pero HASTA ACÁ cada día hacía sus
   * propias consultas a la base dentro del `while` -- para una vigencia
   * anual (~365 días) eso son cientos de round-trips secuenciales, que
   * contra una base remota (reportado por el usuario el 28/09/2026: la
   * request completa tardó ~5 minutos, superó el timeout por default de
   * `fetch` en el gateway y el navegador recibió "fetch failed" aunque
   * la transacción terminó confirmando bien). Se preserva EXACTAMENTE el
   * mismo resultado numérico (`ConceptNetValue` final = valor inicial +
   * suma de los mismos deltas por día, misma fórmula) pero el mapeo
   * día -> movimiento viejo se resuelve en memoria contra los movimientos
   * ya traídos de antemano (una sola consulta), y el `UPDATE` se hace
   * UNA vez por concepto al final, no una vez por día.
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

      // Todos los movimientos viejos de esta cobertura, con sus
      // conceptos, en UNA sola consulta -- antes se repetía (un
      // `findFirst` de movimiento + un `findMany` de conceptos) por
      // CADA día de vigencia del movimiento nuevo, ver nota de
      // performance arriba.
      const oldMovements = await tx.tCoverageMovement.findMany({
        where: { IdeRiskCoverage: ideRiskCoverage },
        include: { TMovementConcept: { include: { SConcept: { include: { SConceptType: { select: { CodConceptType: true } } } } } } },
      });

      for (const newMovement of newMovements) {
        const daysPrimeCalcNew = daysBetween(newMovement.TstInitial, newMovement.TstEnd);
        const candidateOldMovements = oldMovements
          .filter((m) => m.NumCoverageMovement < newMovement.NumCoverageMovement)
          .sort((a, b) => b.NumCoverageMovement - a.NumCoverageMovement);

        const newConcepts = await tx.tMovementConcept.findMany({
          where: { IdeCoverageMovement: newMovement.IdeCoverageMovement },
        });
        const newConceptByIdeConcept = new Map(newConcepts.map((c) => [c.IdeConcept, c]));

        // IdeMovementConcept (del movimiento nuevo) -> delta acumulado a
        // lo largo de todos los días que le tocaron -- mismo cálculo por
        // día que antes, solo que sumado en memoria antes de escribirlo
        // (una vez), en vez de un UPDATE por día.
        const accumulatedDelta = new Map<string, number>();

        let cursor = newMovement.TstInitial;
        while (cursor.getTime() <= newMovement.TstEnd.getTime()) {
          const cursorTime = cursor.getTime();
          const oldMovement = candidateOldMovements.find(
            (m) => m.TstInitial.getTime() <= cursorTime && m.TstEnd.getTime() >= cursorTime,
          );

          if (oldMovement) {
            const daysPrimeCalcOld = daysBetween(oldMovement.TstInitial, oldMovement.TstEnd);
            for (const oldConcept of oldMovement.TMovementConcept) {
              const codConceptType = oldConcept.SConcept.SConceptType.CodConceptType;
              const applies =
                (codConceptType === 'CALCPRIMA' && refundPremium === 'SI') ||
                (codConceptType === 'CALCCOMISION' && refundCommission === 'SI') ||
                (codConceptType === 'CALCIMPUESTO' && refundTax === 'SI');
              if (!applies) continue;

              const newConcept = newConceptByIdeConcept.get(oldConcept.IdeConcept);
              if (!newConcept) continue;

              const delta =
                Number(newConcept.ConceptValue) / daysPrimeCalcNew -
                Number(oldConcept.ConceptNetValue) / daysPrimeCalcOld;
              accumulatedDelta.set(
                newConcept.IdeMovementConcept,
                (accumulatedDelta.get(newConcept.IdeMovementConcept) ?? 0) + delta,
              );
            }
          }
          cursor = addDays(cursor, 1);
        }

        for (const [ideMovementConcept, totalDelta] of accumulatedDelta) {
          const newConcept = newConcepts.find((c) => c.IdeMovementConcept === ideMovementConcept)!;
          await tx.tMovementConcept.update({
            where: { IdeMovementConcept: ideMovementConcept },
            data: {
              ConceptNetValue: Number(newConcept.ConceptNetValue) + totalDelta,
              UsrModification: actor,
              TstModification: now,
            },
          });
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

  // ==========================================================================
  // Cascada del suplemento "Cambio de monto asegurado" -- ver el método
  // público `changeInsuredAmount` (más arriba) para el doc-comment de
  // orden completo. Comparte `resolveOperationCodeByEndorsement`/
  // `createContractOperation`/`generateReceipts` con la cascada de
  // anulación (ver más abajo).
  // ==========================================================================

  /**
   * Valida que el contrato esté `Activo`, que la `TRiskCoverage` indicada
   * exista y esté `Activo`, y que la fecha del suplemento caiga DENTRO de
   * la ventana del movimiento ACTUAL de esa cobertura (`NumCoverageMovement`
   * más alto en estado `Activo`) -- mismo criterio que `createCancellationMovement`
   * usa para encontrar "el último movimiento": sin ese último movimiento
   * no hay contra qué escalar/prorratear la prima nueva.
   */
  private async validateSupplementDate(
    ideContract: string,
    ideRiskCoverage: string,
    tstSupplement: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const contract = await tx.tContract.findFirst({
      where: {
        IdeContract: ideContract,
        IdeState: ideActivo,
        TstInitial: { lte: tstSupplement },
        TstEnd: { gte: tstSupplement },
      },
    });
    if (!contract) {
      throw new ConflictException(
        'No se pudo procesar el suplemento: el contrato no está en estado "Activo" o la fecha del suplemento no está dentro de su vigencia',
      );
    }

    const riskCoverage = await tx.tRiskCoverage.findFirst({
      where: {
        IdeRiskCoverage: ideRiskCoverage,
        IdeState: ideActivo,
        TFileRisk: { TContractFile: { IdeContract: ideContract } },
      },
    });
    if (!riskCoverage) {
      throw new NotFoundException(`No existe una cobertura activa "${ideRiskCoverage}" en el contrato "${ideContract}"`);
    }

    const lastMovement = await tx.tCoverageMovement.findFirst({
      where: { IdeRiskCoverage: ideRiskCoverage, IdeState: ideActivo },
      orderBy: { NumCoverageMovement: 'desc' },
    });
    if (!lastMovement) {
      throw new ConflictException(`La cobertura "${ideRiskCoverage}" no tiene ningún movimiento activo`);
    }
    if (
      tstSupplement.getTime() < lastMovement.TstInitial.getTime() ||
      tstSupplement.getTime() > lastMovement.TstEnd.getTime()
    ) {
      throw new ConflictException(
        'La fecha del suplemento debe estar dentro de la vigencia del movimiento actual de la cobertura',
      );
    }

    return { contract, lastMovement };
  }

  /**
   * Equivalente, para un suplemento, a `createCancellationMovement`: crea
   * el movimiento nuevo (`NumCoverageMovement` = máximo + 1,
   * `[tstSupplement, TstEnd del movimiento actual]` -- a diferencia de la
   * anulación, acá `TstEnd` es el del MOVIMIENTO actual, no el del
   * contrato completo, porque el suplemento no cierra nada, solo
   * reemplaza el tramo restante), con el monto nuevo y el MISMO `Rate`
   * que el movimiento anterior (decisión de negocio "prima proporcional
   * al monto": se asume que la tasa por unidad no cambia, solo la base),
   * y marca el movimiento anterior `'Modificar'` -- transición ya
   * existente y usada por `createCancellationMovement`, no hace falta
   * sembrar ninguna `SStateRule` nueva para esto.
   */
  private async createSupplementMovement(
    ideRiskCoverage: string,
    lastMovement: { IdeCoverageMovement: string; NumCoverageMovement: number; TstEnd: Date; Rate: Prisma.Decimal; IdeState: string },
    tstSupplement: Date,
    newAmount: number,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideMovementInitial = await this.stateMachine.getInitialState('TCoverageMovement');
    const now = new Date();

    const newMovement = await tx.tCoverageMovement.create({
      data: {
        IdeRiskCoverage: ideRiskCoverage,
        NumCoverageMovement: lastMovement.NumCoverageMovement + 1,
        TstInitial: tstSupplement,
        TstEnd: lastMovement.TstEnd,
        Amount: newAmount,
        Rate: lastMovement.Rate,
        Prime: 0,
        IdeState: ideMovementInitial,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });

    const nextState = await this.stateMachine.getNextState('TCoverageMovement', lastMovement.IdeState, 'Modificar');
    await tx.tCoverageMovement.update({
      where: { IdeCoverageMovement: lastMovement.IdeCoverageMovement },
      data: { IdeState: nextState, UsrModification: actor, TstModification: now },
    });

    return newMovement;
  }

  /**
   * Equivalente, para un suplemento, a `setCancelConcept`: por cada
   * concepto del movimiento ANTERIOR, crea el concepto correspondiente en
   * el movimiento NUEVO. Los tipados `CALCPRIMA`/`CALCCOMISION`/
   * `CALCIMPUESTO` (los que el motor ya reconoce como "derivados de la
   * prima") se escalan por `newAmount / oldAmount` (decisión de negocio
   * "prima proporcional al monto", ver doc-comment de `changeInsuredAmount`);
   * cualquier otro tipo de concepto se copia tal cual, sin escalar -- no
   * se asume que TODO en la póliza depende del monto asegurado, solo lo
   * que el motor ya clasifica como cálculo de prima/comisión/impuesto.
   * `ConceptNetValue` nace en 0, provisorio -- `setSupplementPrime` lo
   * recalcula con el prorrateo día a día, mismo orden que
   * `setCancelConcept`/`setCancelPrime`.
   */
  private async setSupplementConcepts(
    ideRiskCoverage: string,
    lastMovement: { IdeCoverageMovement: string; Amount: Prisma.Decimal },
    newMovement: { IdeCoverageMovement: string },
    newAmount: number,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const oldAmount = Number(lastMovement.Amount);
    const ratio = oldAmount !== 0 ? newAmount / oldAmount : 1;

    const oldConcepts = await tx.tMovementConcept.findMany({
      where: { IdeCoverageMovement: lastMovement.IdeCoverageMovement },
      include: { SConcept: { include: { SConceptType: { select: { CodConceptType: true } } } } },
    });

    const ideMovementConceptInitial = await this.stateMachine.getInitialState('TMovementConcept');
    const now = new Date();

    for (const oldConcept of oldConcepts) {
      const codConceptType = oldConcept.SConcept.SConceptType.CodConceptType;
      const scalesWithAmount =
        codConceptType === 'CALCPRIMA' || codConceptType === 'CALCCOMISION' || codConceptType === 'CALCIMPUESTO';
      const conceptValue = scalesWithAmount ? Number(oldConcept.ConceptValue) * ratio : Number(oldConcept.ConceptValue);

      await tx.tMovementConcept.create({
        data: {
          IdeCoverageMovement: newMovement.IdeCoverageMovement,
          IdeConcept: oldConcept.IdeConcept,
          ConceptValue: conceptValue,
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

  /**
   * Equivalente, para un suplemento, a `setCancelPrime` -- MISMA fórmula
   * de prorrateo día a día (`newConcept.ConceptValue/díasNuevo -
   * oldConcept.ConceptNetValue/díasViejo`, ver el doc-comment de
   * `setCancelPrime` para el detalle completo), con dos diferencias
   * deliberadas:
   *  1. Sin banderas `ConditionData.refundPremium/refundCommission/refundTax`
   *     -- un suplemento SIEMPRE recalcula los 3 tipos de concepto, no es
   *     condicional como una devolución de anulación.
   *  2. Al final, además de `TCoverageMovement.Prime`/`TRiskCoverage.Prime`
   *     (igual que `setCancelPrime`), también actualiza `TRiskCoverage.Amount`
   *     con el monto nuevo -- acá la cobertura NO se cierra (sigue
   *     `Activo`), así que su fila debe reflejar el monto vigente.
   *
   * Como esta cascada opera sobre UNA sola cobertura (no todas las del
   * `TContractFile`, a diferencia de `setCancelPrime`), no hace falta el
   * `for` externo por `TRiskCoverage` -- se recibe directo el
   * `ideRiskCoverage`/`ideCoverageMovement` del movimiento nuevo.
   */
  private async setSupplementPrime(
    ideRiskCoverage: string,
    ideCoverageMovement: string,
    newAmount: number,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const [primaNetaConcept, primaTotalConcept] = await Promise.all([
      tx.sConcept.findFirst({ where: { CodConcept: 'PrimaNeta' } }),
      tx.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' } }),
    ]);

    const now = new Date();
    const newMovement = await tx.tCoverageMovement.findUniqueOrThrow({ where: { IdeCoverageMovement: ideCoverageMovement } });

    const oldMovements = await tx.tCoverageMovement.findMany({
      where: { IdeRiskCoverage: ideRiskCoverage },
      include: { TMovementConcept: { include: { SConcept: { include: { SConceptType: { select: { CodConceptType: true } } } } } } },
    });
    const candidateOldMovements = oldMovements
      .filter((m) => m.NumCoverageMovement < newMovement.NumCoverageMovement)
      .sort((a, b) => b.NumCoverageMovement - a.NumCoverageMovement);

    const daysPrimeCalcNew = daysBetween(newMovement.TstInitial, newMovement.TstEnd);
    const newConcepts = await tx.tMovementConcept.findMany({ where: { IdeCoverageMovement: ideCoverageMovement } });
    const newConceptByIdeConcept = new Map(newConcepts.map((c) => [c.IdeConcept, c]));

    const accumulatedDelta = new Map<string, number>();
    let cursor = newMovement.TstInitial;
    while (cursor.getTime() <= newMovement.TstEnd.getTime()) {
      const cursorTime = cursor.getTime();
      const oldMovement = candidateOldMovements.find(
        (m) => m.TstInitial.getTime() <= cursorTime && m.TstEnd.getTime() >= cursorTime,
      );
      if (oldMovement) {
        const daysPrimeCalcOld = daysBetween(oldMovement.TstInitial, oldMovement.TstEnd);
        for (const oldConcept of oldMovement.TMovementConcept) {
          const codConceptType = oldConcept.SConcept.SConceptType.CodConceptType;
          const applies =
            codConceptType === 'CALCPRIMA' || codConceptType === 'CALCCOMISION' || codConceptType === 'CALCIMPUESTO';
          if (!applies) continue;

          const newConcept = newConceptByIdeConcept.get(oldConcept.IdeConcept);
          if (!newConcept) continue;

          const delta =
            Number(newConcept.ConceptValue) / daysPrimeCalcNew - Number(oldConcept.ConceptNetValue) / daysPrimeCalcOld;
          accumulatedDelta.set(
            newConcept.IdeMovementConcept,
            (accumulatedDelta.get(newConcept.IdeMovementConcept) ?? 0) + delta,
          );
        }
      }
      cursor = addDays(cursor, 1);
    }

    for (const [ideMovementConcept, totalDelta] of accumulatedDelta) {
      const newConcept = newConcepts.find((c) => c.IdeMovementConcept === ideMovementConcept)!;
      await tx.tMovementConcept.update({
        where: { IdeMovementConcept: ideMovementConcept },
        data: {
          ConceptNetValue: Number(newConcept.ConceptNetValue) + totalDelta,
          UsrModification: actor,
          TstModification: now,
        },
      });
    }

    let primeValue = 0;
    if (primaTotalConcept) {
      const [primaNetaRow, taxRows] = await Promise.all([
        primaNetaConcept
          ? tx.tMovementConcept.findFirst({
              where: { IdeCoverageMovement: ideCoverageMovement, IdeConcept: primaNetaConcept.IdeConcept },
            })
          : Promise.resolve(null),
        tx.tMovementConcept.findMany({
          where: { IdeCoverageMovement: ideCoverageMovement, SConcept: { SConceptType: { CodConceptType: 'CALCIMPUESTO' } } },
        }),
      ]);
      primeValue = round2(
        (primaNetaRow ? Number(primaNetaRow.ConceptNetValue) : 0) +
          taxRows.reduce((sum, row) => sum + Number(row.ConceptNetValue), 0),
      );
      await tx.tMovementConcept.updateMany({
        where: { IdeCoverageMovement: ideCoverageMovement, IdeConcept: primaTotalConcept.IdeConcept },
        data: { ConceptNetValue: primeValue, UsrModification: actor, TstModification: now },
      });
      await tx.tCoverageMovement.update({
        where: { IdeCoverageMovement: ideCoverageMovement },
        data: { Prime: primeValue, UsrModification: actor, TstModification: now },
      });
    }

    const primaTotalRow = primaTotalConcept
      ? await tx.tMovementConcept.findFirst({
          where: { IdeCoverageMovement: ideCoverageMovement, IdeConcept: primaTotalConcept.IdeConcept },
        })
      : null;
    await tx.tRiskCoverage.update({
      where: { IdeRiskCoverage: ideRiskCoverage },
      data: {
        Amount: newAmount,
        Prime: primaTotalRow ? round2(Number(primaTotalRow.ConceptValue)) : primeValue,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }

  /**
   * Último paso de `changeInsuredAmount`: transiciona el movimiento nuevo
   * (y sus conceptos) de Borrador a Activo -- tiene que correr DESPUÉS de
   * `generateReceipts`, porque ese método solo repunta a la operación
   * RECEGENE los movimientos que sigan en Borrador (`IdeState: ideBorrador`
   * en su `where`); si este paso corriera antes, el movimiento ya no
   * calificaría y quedaría sin `IdeContractOperation` para siempre. Mismo
   * operativo `'Activar'` que ya usa `applyStateCascade` al crear un
   * contrato -- no hace falta sembrar ninguna `SStateRule` nueva.
   */
  private async activateSupplementMovement(
    ideCoverageMovement: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const now = new Date();
    const movement = await tx.tCoverageMovement.findUniqueOrThrow({ where: { IdeCoverageMovement: ideCoverageMovement } });
    const nextMovementState = await this.stateMachine.getNextState('TCoverageMovement', movement.IdeState, 'Activar');
    await tx.tCoverageMovement.update({
      where: { IdeCoverageMovement: ideCoverageMovement },
      data: { IdeState: nextMovementState, UsrModification: actor, TstModification: now },
    });

    const concepts = await tx.tMovementConcept.findMany({ where: { IdeCoverageMovement: ideCoverageMovement } });
    for (const concept of concepts) {
      const nextConceptState = await this.stateMachine.getNextState('TMovementConcept', concept.IdeState, 'Activar');
      await tx.tMovementConcept.update({
        where: { IdeMovementConcept: concept.IdeMovementConcept },
        data: { IdeState: nextConceptState, UsrModification: actor, TstModification: now },
      });
    }
  }

  // ==========================================================================
  // Cascada de los suplementos "Alta de cobertura" / "Baja de cobertura"
  // -- ver los métodos públicos `addCoverage`/`removeCoverage` (más
  // arriba) para el doc-comment de orden completo. `removeCoverage`
  // reutiliza directamente los helpers de "Cambio de monto asegurado"
  // (arriba); acá solo van los helpers propios de "Alta de cobertura"
  // más `closeRiskCoverage`, compartido por ambos suplementos.
  // ==========================================================================

  /**
   * Valida que el contrato esté `Activo` (con la fecha del suplemento
   * dentro de su vigencia), que el `TFileRisk` indicado exista, esté
   * `Activo` y pertenezca a este contrato, que la `SCoveragePlan` exista,
   * esté `Activo` y pertenezca al MISMO `IdePlanProductRisk` del riesgo
   * (mismo join que usa `populateQuoteCoverages` al listar las coberturas
   * disponibles de un plan), y que el riesgo NO tenga ya una
   * `TRiskCoverage` activa con esa misma `SCoveragePlan` (no tiene
   * sentido duplicar una cobertura ya vigente -- para cambiarle el monto
   * existe `changeInsuredAmount`).
   */
  private async validateAddCoverage(
    ideContract: string,
    ideFileRisk: string,
    ideCoveragePlan: string,
    tstSupplement: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const contract = await tx.tContract.findFirst({
      where: {
        IdeContract: ideContract,
        IdeState: ideActivo,
        TstInitial: { lte: tstSupplement },
        TstEnd: { gte: tstSupplement },
      },
    });
    if (!contract) {
      throw new ConflictException(
        'No se pudo procesar el suplemento: el contrato no está en estado "Activo" o la fecha del suplemento no está dentro de su vigencia',
      );
    }

    const fileRisk = await tx.tFileRisk.findFirst({
      where: { IdeFileRisk: ideFileRisk, IdeState: ideActivo, TContractFile: { IdeContract: ideContract } },
    });
    if (!fileRisk) {
      throw new NotFoundException(`No existe un riesgo activo "${ideFileRisk}" en el contrato "${ideContract}"`);
    }

    const coveragePlan = await tx.sCoveragePlan.findFirst({
      where: { IdeCoveragePlan: ideCoveragePlan, IdeState: ideActivo, IdePlanProductRisk: fileRisk.IdePlanProductRisk },
    });
    if (!coveragePlan) {
      throw new NotFoundException(
        `La cobertura "${ideCoveragePlan}" no está disponible para el plan del riesgo "${ideFileRisk}"`,
      );
    }

    const existingCoverage = await tx.tRiskCoverage.findFirst({
      where: { IdeFileRisk: ideFileRisk, IdeCoveragePlan: ideCoveragePlan, IdeState: ideActivo },
    });
    if (existingCoverage) {
      throw new ConflictException(`El riesgo "${ideFileRisk}" ya tiene activa la cobertura "${ideCoveragePlan}"`);
    }

    return { fileRisk, coveragePlan };
  }

  /**
   * Crea la `TRiskCoverage` nueva en Borrador, con vigencia
   * `[tstSupplement, TstEnd del TFileRisk]` (no arranca desde el inicio
   * del contrato -- recién se está agregando hoy) y monto/tasa
   * resueltos ANTES de pasar por el motor de reglas (que a nivel de
   * `TCoverageMovement` nunca calcula `Amount`/`Rate` dinámicamente,
   * confirmado en `createInitialMovements`): `Amount` = `dto.newAmount`
   * si el usuario indicó uno, si no el default de `SCoveragePlan`
   * (`IndFixedAmount ? UpperAmount : 0`, mismo criterio que
   * `populateQuoteCoverages` al cotizar); `Rate` = siempre
   * `IndFixedRate ? UpperRate : 0` (no se pidió poder editarla).
   */
  private async createNewRiskCoverage(
    fileRisk: { IdeFileRisk: string; TstEnd: Date },
    coveragePlan: {
      IdeCoveragePlan: string;
      IndFixedAmount: boolean;
      UpperAmount: Prisma.Decimal;
      IndFixedRate: boolean;
      UpperRate: Prisma.Decimal;
    },
    newAmount: number | undefined,
    tstSupplement: Date,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideRiskCoverageInitial = await this.stateMachine.getInitialState('TRiskCoverage');
    const amount = newAmount ?? (coveragePlan.IndFixedAmount ? Number(coveragePlan.UpperAmount) : 0);
    const rate = coveragePlan.IndFixedRate ? Number(coveragePlan.UpperRate) : 0;
    const now = new Date();
    return tx.tRiskCoverage.create({
      data: {
        IdeFileRisk: fileRisk.IdeFileRisk,
        IdeCoveragePlan: coveragePlan.IdeCoveragePlan,
        TstInitial: tstSupplement,
        TstEnd: fileRisk.TstEnd,
        Amount: amount,
        Rate: rate,
        Prime: 0,
        IdeState: ideRiskCoverageInitial,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }

  /**
   * Último paso de `addCoverage`: transiciona la `TRiskCoverage` nueva
   * (Borrador -> Activo) y, reutilizando `activateSupplementMovement`,
   * su único movimiento inicial y los conceptos de ese movimiento --
   * tiene que correr DESPUÉS de `generateReceipts`, mismo motivo ya
   * documentado en `changeInsuredAmount`/`activateSupplementMovement`.
   */
  private async activateNewCoverage(
    ideRiskCoverage: string,
    ideCoverageMovement: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const coverage = await tx.tRiskCoverage.findUniqueOrThrow({ where: { IdeRiskCoverage: ideRiskCoverage } });
    const nextState = await this.stateMachine.getNextState('TRiskCoverage', coverage.IdeState, 'Activar');
    await tx.tRiskCoverage.update({
      where: { IdeRiskCoverage: ideRiskCoverage },
      data: { IdeState: nextState, UsrModification: actor, TstModification: new Date() },
    });
    await this.activateSupplementMovement(ideCoverageMovement, actor, tx);
  }

  /**
   * Último paso de `removeCoverage`: transiciona la `TRiskCoverage` de
   * `Activo` a `'Modificar'` -- mismo operativo/estado que usa
   * `cancelRiskCoverage` al anular todo el contrato, así que no hace
   * falta sembrar ninguna `SStateRule` nueva. Sin este paso, la
   * cobertura quedaría mostrada como "Activo" con monto/prima en 0 para
   * siempre, en vez de reflejar que fue dada de baja.
   */
  private async closeRiskCoverage(
    ideRiskCoverage: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const coverage = await tx.tRiskCoverage.findUniqueOrThrow({ where: { IdeRiskCoverage: ideRiskCoverage } });
    const nextState = await this.stateMachine.getNextState('TRiskCoverage', coverage.IdeState, 'Modificar');
    await tx.tRiskCoverage.update({
      where: { IdeRiskCoverage: ideRiskCoverage },
      data: { IdeState: nextState, UsrModification: actor, TstModification: new Date() },
    });
  }

  // ==========================================================================
  // Cascada de los suplementos "Alta de riesgo" / "Baja de riesgo" (Etapa
  // 4) -- ver los métodos públicos `addRisk`/`removeRisk` (más arriba)
  // para el doc-comment de orden completo. `removeRisk` reutiliza
  // directamente los helpers de "Cambio de monto asegurado"/"Baja de
  // cobertura" (arriba); acá solo van los helpers propios de "Alta de
  // riesgo" más `closeFileRisk`, compartido por ambos suplementos.
  // ==========================================================================

  /**
   * Valida que el contrato esté `Activo` (con la fecha del suplemento
   * dentro de su vigencia), que el `TContractFile` indicado exista, esté
   * `Activo` y pertenezca a este contrato, y que la `SPlanProductRisk`
   * exista, esté `Activo` y pertenezca al MISMO producto del contrato
   * (`SPlanProduct.IdeProduct`) -- mismo criterio de validación que
   * `validateAddCoverage`, un nivel más arriba en la jerarquía.
   */
  private async validateAddRisk(
    ideContract: string,
    ideProduct: string,
    ideContractFile: string,
    idePlanProductRisk: string,
    tstSupplement: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const contract = await tx.tContract.findFirst({
      where: {
        IdeContract: ideContract,
        IdeState: ideActivo,
        TstInitial: { lte: tstSupplement },
        TstEnd: { gte: tstSupplement },
      },
    });
    if (!contract) {
      throw new ConflictException(
        'No se pudo procesar el suplemento: el contrato no está en estado "Activo" o la fecha del suplemento no está dentro de su vigencia',
      );
    }

    const contractFile = await tx.tContractFile.findFirst({
      where: { IdeContractFile: ideContractFile, IdeState: ideActivo, IdeContract: ideContract },
    });
    if (!contractFile) {
      throw new NotFoundException(`No existe un certificado activo "${ideContractFile}" en el contrato "${ideContract}"`);
    }

    const planProductRisk = await tx.sPlanProductRisk.findFirst({
      where: { IdePlanProductRisk: idePlanProductRisk, IdeState: ideActivo, SPlanProduct: { IdeProduct: ideProduct } },
    });
    if (!planProductRisk) {
      throw new NotFoundException(`El plan de riesgo "${idePlanProductRisk}" no está disponible para este producto`);
    }

    return { contractFile, planProductRisk };
  }

  /**
   * Crea el `TFileRisk` nuevo, con vigencia `[tstSupplement, TstEnd del
   * TContractFile]` (no arranca desde el inicio del contrato -- recién
   * se está agregando hoy, mismo criterio que `createNewRiskCoverage`) y
   * lo activa de inmediato -- a diferencia de una cobertura, un riesgo
   * vacío no tiene ningún movimiento/recibo que esperar, así que no hace
   * falta separar "crear en Borrador" de "activar" en dos pasos con
   * `generateReceipts` en el medio.
   */
  private async createNewFileRisk(
    contractFile: { IdeContractFile: string; TstEnd: Date },
    planProductRisk: { IdePlanProductRisk: string; IdeRiskProduct: string },
    desFileRisk: string | undefined,
    riskAttributeValue: unknown,
    tstSupplement: Date,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideFileRiskInitial = await this.stateMachine.getInitialState('TFileRisk');
    const maxNumFileRisk = await tx.tFileRisk.aggregate({
      where: { IdeContractFile: contractFile.IdeContractFile },
      _max: { NumFileRisk: true },
    });
    const numFileRisk = (maxNumFileRisk._max.NumFileRisk ?? 0) + 1;
    const now = new Date();

    const fileRisk = await tx.tFileRisk.create({
      data: {
        IdeContractFile: contractFile.IdeContractFile,
        NumFileRisk: numFileRisk,
        DesFileRisk: desFileRisk ?? null,
        IdeRiskProduct: planProductRisk.IdeRiskProduct,
        IdePlanProductRisk: planProductRisk.IdePlanProductRisk,
        RiskAttributeValue: (riskAttributeValue as object | undefined) ?? undefined,
        TstInclusion: now,
        TstInitial: tstSupplement,
        TstEnd: contractFile.TstEnd,
        IdeState: ideFileRiskInitial,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });

    const nextState = await this.stateMachine.getNextState('TFileRisk', fileRisk.IdeState, 'Activar');
    return tx.tFileRisk.update({
      where: { IdeFileRisk: fileRisk.IdeFileRisk },
      data: { IdeState: nextState, UsrModification: actor, TstModification: now },
    });
  }

  /**
   * Valida que el contrato esté `Activo` (con la fecha del suplemento
   * dentro de su vigencia) y que el `TFileRisk` indicado exista, esté
   * `Activo` y pertenezca a este contrato -- mismo criterio que
   * `validateAddCoverage`/`validateSupplementDate`, a nivel de riesgo.
   */
  private async validateRemoveRisk(
    ideContract: string,
    ideFileRisk: string,
    tstSupplement: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const contract = await tx.tContract.findFirst({
      where: {
        IdeContract: ideContract,
        IdeState: ideActivo,
        TstInitial: { lte: tstSupplement },
        TstEnd: { gte: tstSupplement },
      },
    });
    if (!contract) {
      throw new ConflictException(
        'No se pudo procesar el suplemento: el contrato no está en estado "Activo" o la fecha del suplemento no está dentro de su vigencia',
      );
    }

    const fileRisk = await tx.tFileRisk.findFirst({
      where: { IdeFileRisk: ideFileRisk, IdeState: ideActivo, TContractFile: { IdeContract: ideContract } },
    });
    if (!fileRisk) {
      throw new NotFoundException(`No existe un riesgo activo "${ideFileRisk}" en el contrato "${ideContract}"`);
    }
    return fileRisk;
  }

  /**
   * Último paso de `removeRisk`: transiciona el `TFileRisk` de `Activo`
   * a `'Modificar'` y registra la cancelación (`TstCancellation`/
   * `DesCancellation`) -- mismo operativo/estado y mismos campos que usa
   * `cancelFileRisk` en la anulación total del contrato, así que no hace
   * falta sembrar ninguna `SStateRule` nueva. Corre DESPUÉS de cerrar
   * todas sus `TRiskCoverage` (`closeRiskCoverage`, en el `for` de
   * `removeRisk`).
   */
  private async closeFileRisk(
    ideFileRisk: string,
    tstSupplement: Date,
    desSupplement: string,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const current = await tx.tFileRisk.findUniqueOrThrow({ where: { IdeFileRisk: ideFileRisk } });
    const nextState = await this.stateMachine.getNextState('TFileRisk', current.IdeState, 'Modificar');
    await tx.tFileRisk.update({
      where: { IdeFileRisk: ideFileRisk },
      data: {
        TstCancellation: tstSupplement,
        DesCancellation: desSupplement,
        IdeState: nextState,
        UsrModification: actor,
        TstModification: new Date(),
      },
    });
  }

  /**
   * Suplemento "Cambio de datos Titular/Tomador" (Etapa 5 de
   * "Movimientos y suplementos del contrato", ver docs/02-roadmap.md) --
   * a diferencia de `addRisk`/`addCoverage`, esta cascada NO toca ninguna
   * prima ni `TCoverageMovement`: solo dos cosas en la MISMA transacción,
   * para que queden atómicas: (1) la operación de contrato de
   * trazabilidad, igual que cualquier otro suplemento (decisión explícita
   * del usuario, conversación anterior a esta implementación: "necesito
   * que quede como endoso aunque no afecte la prima"), y (2) la
   * actualización real de `TPerson`/`TAddress`/`TContactData` --
   * accedidos DIRECTAMENTE vía `this.prisma` (mismo esquema compartido
   * que ya usa `QuotesService.setPerson`/`listPersons`, sin llamada HTTP
   * a `party-service`) para que ambos pasos queden atómicos de verdad.
   *
   * Alcance de campos, decisión explícita del usuario (`AskUserQuestion`,
   * 2026-09-29): "Contacto + identidad básica" -- ver el doc-comment de
   * `ChangePersonDataDto` para el detalle completo. El diálogo reemplaza
   * el VALOR COMPLETO de cada campo (no un patch parcial como
   * `PersonsService.update` en `party-service`): dirección y teléfono
   * móvil principal se actualizan si ya existen, o se crean si la
   * persona todavía no tenía (defensivo -- en la práctica ya deberían
   * existir, por `assertPersonsReadyForIssuance` al emitir el contrato).
   */
  async changePersonData(ideContract: string, dto: ChangePersonDataDto, actor: string) {
    const existing = await this.prisma.tContract.findUnique({ where: { IdeContract: ideContract } });
    if (!existing) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }

    const tstSupplement = new Date(dto.tstSupplement);

    await this.prisma.$transaction(
      async (tx) => {
        const contractPerson = await this.validateChangePersonData(ideContract, dto.ideContractPerson, tstSupplement, tx);

        const codOperation = await this.resolveOperationCodeByEndorsement(dto.ideProductEndorsement, tx);
        await this.createContractOperation(ideContract, existing.IdeProduct, codOperation, actor, tx);

        await this.updatePersonCoreData(contractPerson.IdePerson, contractPerson.TPerson, dto, actor, tx);
        await this.upsertMainAddress(contractPerson.IdePerson, dto, actor, tx);
        await this.upsertMobilePhone(contractPerson.IdePerson, dto.mobilePhone, actor, tx);
      },
      { timeout: SUPPLEMENT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    return this.findOne(ideContract);
  }

  private async validateChangePersonData(
    ideContract: string,
    ideContractPerson: string,
    tstSupplement: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const contract = await tx.tContract.findFirst({
      where: { IdeContract: ideContract, IdeState: ideActivo, TstInitial: { lte: tstSupplement }, TstEnd: { gte: tstSupplement } },
    });
    if (!contract) {
      throw new ConflictException('No se pudo procesar el suplemento: el contrato no está en estado "Activo" o la fecha del suplemento no está dentro de su vigencia');
    }
    const contractPerson = await tx.tContractPerson.findFirst({
      where: { IdeContractPerson: ideContractPerson, IdeContract: ideContract, IdeState: ideActivo },
      include: { TPerson: true },
    });
    if (!contractPerson) {
      throw new NotFoundException(`No existe una persona activa "${ideContractPerson}" en el contrato "${ideContract}"`);
    }
    return contractPerson;
  }

  private async updatePersonCoreData(
    idePerson: string,
    currentPerson: { DesEmail: string; NumIdentification: string | null; IdeIdentificationType: string | null },
    dto: ChangePersonDataDto,
    actor: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (dto.desEmail !== currentPerson.DesEmail) {
      const emailTaken = await tx.tPerson.findFirst({ where: { DesEmail: dto.desEmail, NOT: { IdePerson: idePerson } } });
      if (emailTaken) {
        throw new ConflictException(`Ya existe una persona con el email "${dto.desEmail}"`);
      }
    }
    if (
      dto.numIdentification !== undefined &&
      dto.numIdentification !== currentPerson.NumIdentification &&
      currentPerson.IdeIdentificationType
    ) {
      const idTaken = await tx.tPerson.findFirst({
        where: {
          NumIdentification: dto.numIdentification,
          IdeIdentificationType: currentPerson.IdeIdentificationType,
          NOT: { IdePerson: idePerson },
        },
      });
      if (idTaken) {
        throw new ConflictException('Ya existe una persona con esa identificación');
      }
    }

    await tx.tPerson.update({
      where: { IdePerson: idePerson },
      data: {
        DesFirstName: dto.desFirstName,
        DesLastName1: dto.desLastName1 ?? null,
        DesEmail: dto.desEmail,
        NumIdentification: dto.numIdentification ?? null,
        UsrModification: actor,
        TstModification: new Date(),
      },
    });
  }

  private async upsertMainAddress(
    idePerson: string,
    dto: ChangePersonDataDto,
    actor: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const existingAddress = await tx.tAddress.findFirst({ where: { IdePerson: idePerson, IndMain: true, IdeState: ideActivo } });
    if (existingAddress) {
      await tx.tAddress.update({
        where: { IdeAddress: existingAddress.IdeAddress },
        data: {
          DesAddressLine1: dto.desAddressLine1,
          DesAddressLine2: dto.desAddressLine2 ?? null,
          CodPostal: dto.codPostal,
          UsrModification: actor,
          TstModification: now,
        },
      });
      return;
    }
    await tx.tAddress.create({
      data: {
        IdePerson: idePerson,
        DesAddressLine1: dto.desAddressLine1,
        DesAddressLine2: dto.desAddressLine2 ?? null,
        CodPostal: dto.codPostal,
        IndMain: true,
        IdeState: ideActivo,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
  }

  private async upsertMobilePhone(
    idePerson: string,
    mobilePhone: string,
    actor: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const existingContact = await tx.tContactData.findFirst({
      where: { IdePerson: idePerson, IndMain: true, IdeState: ideActivo, SContactClass: { CodContactClass: 'MOBILE_PHONE' } },
    });
    if (existingContact) {
      await tx.tContactData.update({
        where: { IdeContactData: existingContact.IdeContactData },
        data: { DesContactData: mobilePhone, UsrModification: actor, TstModification: now },
      });
      return;
    }
    const contactClass = await tx.sContactClass.findFirst({ where: { CodContactClass: 'MOBILE_PHONE' } });
    if (!contactClass) {
      throw new NotFoundException('No existe la clase de contacto "MOBILE_PHONE"');
    }
    await tx.tContactData.create({
      data: {
        IdePerson: idePerson,
        IdeContactClass: contactClass.IdeContactClass,
        DesContactData: mobilePhone,
        IndMain: true,
        IdeState: ideActivo,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
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
   *
   * CORREGIDO 2026-09-30 (encontrado por el usuario al probar "Renovar
   * contrato" en pantalla): la rama `NumOperation===2 && ContractAge>1
   * -> 'REN'` es efectivamente inalcanzable en la práctica -- confirmado
   * contra un contrato real recién renovado, que ya traía varios
   * suplementos (`SUPMONTO`/`COVEALTA`/`COVEBAJA`/etc.) antes de
   * renovarse, así que `NumOperation` ya estaba en 13, no en 2. Cualquier
   * contrato con al menos un suplemento previo a su renovación cae
   * siempre en `NumOperation>2`, quedando `'SUP'` igual que una anulación
   * -- el mismo defecto ya documentado arriba, ahora también alcanza a
   * renovación. En vez de intentar arreglar el `CASE` genérico (usado
   * también por `create()`/`cancel()`/todos los suplementos, no vale la
   * pena tocarlo), `renew()` pasa `forceReceiptTypeCode='REN'` para fijar
   * el tipo directamente, sin pasar por ese cálculo -- una renovación
   * SIEMPRE es `'REN'`, sin importar cuántos suplementos tuvo el contrato
   * antes.
   */
  private async generateReceipts(
    ideContract: string,
    ideProductEndorsement: string | null,
    actor: string,
    tx: Prisma.TransactionClient = this.prisma,
    forceReceiptTypeCode?: 'REN',
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
      forceReceiptTypeCode ??
      (numOperation === 2 && contract.ContractAge === 1
        ? 'NEW'
        : numOperation > 2
          ? 'SUP'
          : numOperation === 2 && contract.ContractAge > 1
            ? 'REN'
            : null);
    if (!receiptTypeCode) {
      throw new ConflictException(
        `No se pudo determinar el tipo de recibo para NumOperation=${numOperation}/ContractAge=${contract.ContractAge}`,
      );
    }
    const ideReceiptType = await this.resolveReceiptType(receiptTypeCode);

    /**
     * Comisión de cartera (renovación) -- backlog item 3 (depende del
     * item 2, "Gestión de renovaciones", ya cerrado). ANTES de esto, la
     * comisión de CUALQUIER recibo (nuevo, suplemento o renovación) se
     * resolvía siempre contra `operationProduct.IdeProcess` -- el
     * proceso FIJO configurado para RECEGENE en este producto
     * (normalmente "Contratación"), el mismo para los tres casos. Una
     * renovación terminaba pagando exactamente la misma comisión que una
     * venta nueva, sin forma de configurar una tasa de cartera distinta
     * (más baja, como es la práctica real del seguro). `SCommission` ya
     * soporta una fila distinta por `IdeProcess` (`@@unique([IdeCommissionTable,
     * IdeProcess, NumMovement])`) y la pantalla de Comisiones ya permite
     * elegir cualquier proceso al darla de alta -- lo único que faltaba
     * era resolver contra el proceso correcto. Para una renovación, se
     * usa en cambio el proceso real de la operación `RENOVGENE` (el
     * `SProcess` "RENOVACION" ya existente, ver Etapa 1 de "Gestión de
     * renovaciones") -- Nuevo/Suplemento no cambian, siguen contra el
     * proceso fijo de RECEGENE, igual que siempre.
     */
    const commissionOperationProduct =
      receiptTypeCode === 'REN'
        ? await tx.sOperationProduct.findFirstOrThrow({
            where: { IdeProduct: contract.IdeProduct, SOperation: { CodOperation: 'RENOVGENE' } },
          })
        : operationProduct;

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
            ideProcess: commissionOperationProduct.IdeProcess,
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
