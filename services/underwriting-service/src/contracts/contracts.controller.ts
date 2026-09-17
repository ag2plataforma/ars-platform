import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { TransitionContractStateDto } from './dto/transition-contract-state.dto';

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
}
