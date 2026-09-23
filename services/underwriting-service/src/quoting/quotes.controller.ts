import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { ToggleCoverageDto } from './dto/toggle-coverage.dto';
import { SetQuotePersonDto } from './dto/set-quote-person.dto';
import { TransitionQuoteStateDto } from './dto/transition-quote-state.dto';
import { ListQuotesDto } from './dto/list-quotes.dto';
import { SubmitSocialImpactAnswersDto } from '../social-impact/dto/submit-social-impact-answers.dto';

/**
 * Fase 1 del motor de cotización real (ver el comentario de cabecera de
 * `QuotesService`): crear, cotizar (precio), las mutaciones de
 * selección de plan/cobertura, asociar personas (`TQuotePerson`),
 * resumen (equivalente a `FGetQuoteSummary`) y una transición de estado
 * genérica (equivalente a `FQuote_SetState`). DELIBERADAMENTE AFUERA de
 * esta fase: la cascada de creación de contrato (`FContract` y todo lo
 * que orquesta) -- "el trabajo de mayor riesgo del proyecto" (ver
 * README de este servicio), le toca su propio ítem del roadmap.
 *
 * Sin `@Roles(...)`: cotizar es una operación de usuario autenticado
 * normal, no administración de catálogo (a diferencia de los
 * controladores de `product-rating-service`/`reference-data-service`).
 */
@Controller('quotes')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  /**
   * Listado paginado/filtrable (ver `ListQuotesDto`) -- no colisiona con
   * `GET :id` de abajo (rutas de distinta longitud, `/quotes` vs
   * `/quotes/:id`), así que el orden de declaración no importa acá.
   */
  @Get()
  findAll(@Query() query: ListQuotesDto, @CurrentUser() actor: JwtPayload) {
    return this.service.findAll(query, actor.code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.buildPricingResult(id);
  }

  @Get(':id/summary')
  getSummary(@Param('id') id: string) {
    return this.service.getSummary(id);
  }

  @Post(':id/price')
  price(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.price(id, actor.code);
  }

  @Patch(':id/risks/:ideQuoteRisk/plans/:ideQuoteRiskPlan/select')
  selectPlan(
    @Param('id') id: string,
    @Param('ideQuoteRisk') ideQuoteRisk: string,
    @Param('ideQuoteRiskPlan') ideQuoteRiskPlan: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.selectPlan(id, ideQuoteRisk, ideQuoteRiskPlan, actor.code);
  }

  @Patch(':id/risk-plans/:ideQuoteRiskPlan/coverages/:ideQuoteCoverage')
  toggleCoverage(
    @Param('id') id: string,
    @Param('ideQuoteRiskPlan') ideQuoteRiskPlan: string,
    @Param('ideQuoteCoverage') ideQuoteCoverage: string,
    @Body() dto: ToggleCoverageDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.toggleCoverage(id, ideQuoteRiskPlan, ideQuoteCoverage, dto.selected, actor.code);
  }

  @Get(':id/persons')
  listPersons(@Param('id') id: string) {
    return this.service.listPersons(id);
  }

  @Put(':id/persons')
  setPerson(@Param('id') id: string, @Body() dto: SetQuotePersonDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setPerson(id, dto.idePerson, dto.codPersonRol, actor.code);
  }

  @Delete(':id/persons/:codPersonRol')
  removePerson(@Param('id') id: string, @Param('codPersonRol') codPersonRol: string) {
    return this.service.removePerson(id, codPersonRol);
  }

  @Post(':id/state')
  transitionState(
    @Param('id') id: string,
    @Body() dto: TransitionQuoteStateDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.transitionState(id, dto.codOperative, actor.code);
  }

  /**
   * Nuevo paso del wizard de Cotización (Impacto Social, Etapa 2, ver
   * docs/02-roadmap.md): envía las respuestas del formulario, dispara el
   * cálculo real contra `social-impact-service` y persiste el resultado.
   * Se reenvía el header `Authorization` crudo (no `@CurrentUser()`, que
   * solo da el payload ya decodificado) porque `social-impact-service`
   * necesita el JWT original para su propio guard.
   */
  @Post(':id/social-impact-answers')
  submitSocialImpactAnswers(
    @Param('id') id: string,
    @Body() dto: SubmitSocialImpactAnswersDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('authorization') authorization: string,
  ) {
    return this.service.submitSocialImpactAnswers(id, dto, actor.code, authorization);
  }
}
