import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { ToggleCoverageDto } from './dto/toggle-coverage.dto';

/**
 * Fase 1 del motor de cotización real (ver el comentario de cabecera de
 * `QuotesService`): crear, cotizar (precio) y las mutaciones de
 * selección de plan/cobertura. DELIBERADAMENTE AFUERA de esta fase:
 * resumen (`QUOTESUMMARY`) y aceptar la cotización -- dependen de
 * `TPerson`/`party-service`, todavía scaffold (ver docs/02-roadmap.md).
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.buildPricingResult(id);
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
}
