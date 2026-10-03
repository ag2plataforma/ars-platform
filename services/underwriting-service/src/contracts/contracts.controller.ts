import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { TransitionContractStateDto } from './dto/transition-contract-state.dto';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { ChangeInsuredAmountDto } from './dto/change-insured-amount.dto';
import { AddCoverageDto } from './dto/add-coverage.dto';
import { RemoveCoverageDto } from './dto/remove-coverage.dto';
import { AddRiskDto } from './dto/add-risk.dto';
import { RemoveRiskDto } from './dto/remove-risk.dto';
import { ChangePersonDataDto } from './dto/change-person-data.dto';
import { ListContractsDto } from './dto/list-contracts.dto';
import { ListRenewalCandidatesDto } from './dto/list-renewal-candidates.dto';
import { SetRenewalOptOutDto } from './dto/set-renewal-opt-out.dto';

/**
 * Cascada de creación de contrato (`FContract('CONTRACTNEW', ...)` y todo lo
 * que orquesta -- ver el comentario de cabecera de `ContractsService` para
 * el detalle completo del alcance y lo deliberadamente diferido). "El
 * trabajo de mayor riesgo del proyecto" (ver README de este servicio).
 *
 * `POST /quotes/:ideQuote/contract` cuelga de `quotes` (no de `contracts`)
 * porque conceptualmente es una transición de la cotización de origen --
 * mismo criterio de URL que ya usa `POST /quotes/:id/state`.
 */
@Controller()
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Post('quotes/:ideQuote/contract')
  create(@Param('ideQuote') ideQuote: string, @Body() dto: CreateContractDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(ideQuote, dto, actor.code);
  }

  /**
   * Listado paginado/filtrable (ver `ListContractsDto`, mismo patrón que
   * `GET /quotes`) -- pedido explícito del usuario, pantalla de listado
   * de contratos (ver docs/02-roadmap.md). Declarado ANTES que
   * `:id` (mismo motivo que en `QuotesController`: `/contracts` vs
   * `/contracts/:id` no colisionan por longitud, pero se mantiene el
   * orden por claridad).
   */
  @Get('contracts')
  findAll(@Query() query: ListContractsDto, @CurrentUser() actor: JwtPayload) {
    return this.service.findAll(query, actor.code);
  }

  /**
   * Estadísticas para el dashboard de inicio (ver doc-comment de
   * `ContractsService.getPortfolioStats`). Declarado ANTES de `:id` --
   * mismo motivo que `renewal-candidates` de acá abajo.
   */
  @Get('contracts/stats')
  getPortfolioStats() {
    return this.service.getPortfolioStats();
  }

  /**
   * Candidatos a renovar (Etapa 2, pantalla "Renovaciones", ver
   * docs/02-roadmap.md). Declarado ANTES que `:id` -- mismo motivo que
   * `contracts` (plural): si fuera después, Express/Nest tomaría
   * "renewal-candidates" como el valor de `:id`.
   */
  @Get('contracts/renewal-candidates')
  findRenewalCandidates(@Query() query: ListRenewalCandidatesDto) {
    return this.service.findRenewalCandidates(query);
  }

  @Get('contracts/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('contracts/:id/state')
  transitionState(
    @Param('id') id: string,
    @Body() dto: TransitionContractStateDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.transitionState(id, dto.codOperative, actor.code);
  }

  /**
   * Cascada de anulación de contrato, equivalente a `FContract('CANCELCONTRACT', ...)`.
   * Endpoint dedicado (no el genérico `/state`) porque requiere parámetros
   * propios del endoso de anulación -- ver `CancelContractDto`.
   */
  /**
   * Acción explícita "Activar contrato" -- ver el doc-comment de
   * `ContractsService.activate` para el detalle completo. Sin DTO: no
   * requiere body, solo el id del contrato.
   */
  @Post('contracts/:id/activate')
  activate(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.activate(id, actor.code);
  }

  /**
   * Acción "Renovar contrato" -- ver el doc-comment de
   * `ContractsService.renew` para el detalle completo. Sin DTO: no
   * requiere body, solo el id del contrato.
   */
  @Post('contracts/:id/renew')
  renew(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.renew(id, actor.code);
  }

  /** Etapa 2 de "Gestión de renovaciones" -- marcar/desmarcar "No
   *  renovar" sobre un contrato candidato (ver docs/02-roadmap.md). */
  @Patch('contracts/:id/renewal-opt-out')
  setRenewalOptOut(@Param('id') id: string, @Body() dto: SetRenewalOptOutDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setRenewalOptOut(id, dto.noRenovar, actor.code);
  }

  @Post('contracts/:id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelContractDto, @CurrentUser() actor: JwtPayload) {
    return this.service.cancel(id, dto, actor.code);
  }

  /**
   * Suplemento "Cambio de monto asegurado" -- ver el doc-comment de
   * `ContractsService.changeInsuredAmount` para el detalle completo de la
   * cascada. Igual que `cancel`, endpoint dedicado (no el genérico
   * `/state`) porque requiere parámetros propios del endoso.
   */
  @Post('contracts/:id/change-amount')
  changeInsuredAmount(
    @Param('id') id: string,
    @Body() dto: ChangeInsuredAmountDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.changeInsuredAmount(id, dto, actor.code);
  }

  /**
   * Suplemento "Alta de cobertura" -- ver el doc-comment de
   * `ContractsService.addCoverage` para el detalle completo.
   */
  @Post('contracts/:id/add-coverage')
  addCoverage(@Param('id') id: string, @Body() dto: AddCoverageDto, @CurrentUser() actor: JwtPayload) {
    return this.service.addCoverage(id, dto, actor.code);
  }

  /**
   * Suplemento "Baja de cobertura" -- ver el doc-comment de
   * `ContractsService.removeCoverage` para el detalle completo.
   */
  @Post('contracts/:id/remove-coverage')
  removeCoverage(@Param('id') id: string, @Body() dto: RemoveCoverageDto, @CurrentUser() actor: JwtPayload) {
    return this.service.removeCoverage(id, dto, actor.code);
  }

  /**
   * Suplemento "Alta de riesgo" -- ver el doc-comment de
   * `ContractsService.addRisk` para el detalle completo.
   */
  @Post('contracts/:id/add-risk')
  addRisk(@Param('id') id: string, @Body() dto: AddRiskDto, @CurrentUser() actor: JwtPayload) {
    return this.service.addRisk(id, dto, actor.code);
  }

  /**
   * Suplemento "Baja de riesgo" -- ver el doc-comment de
   * `ContractsService.removeRisk` para el detalle completo.
   */
  @Post('contracts/:id/remove-risk')
  removeRisk(@Param('id') id: string, @Body() dto: RemoveRiskDto, @CurrentUser() actor: JwtPayload) {
    return this.service.removeRisk(id, dto, actor.code);
  }

  /**
   * Suplemento "Cambio de datos Titular/Tomador" -- ver el doc-comment
   * de `ContractsService.changePersonData` para el detalle completo.
   */
  @Post('contracts/:id/change-person-data')
  changePersonData(@Param('id') id: string, @Body() dto: ChangePersonDataDto, @CurrentUser() actor: JwtPayload) {
    return this.service.changePersonData(id, dto, actor.code);
  }
}
