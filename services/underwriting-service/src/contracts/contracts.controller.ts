import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { TransitionContractStateDto } from './dto/transition-contract-state.dto';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { ChangeInsuredAmountDto } from './dto/change-insured-amount.dto';
import { AddCoverageDto } from './dto/add-coverage.dto';
import { RemoveCoverageDto } from './dto/remove-coverage.dto';
import { ListContractsDto } from './dto/list-contracts.dto';

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
}
