import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { RequirementsService } from './requirements.service';
import { SetQuoteRequirementDeliveredDto } from './dto/set-quote-requirement-delivered.dto';

/**
 * Endpoints del checklist de Requisitos consumidos por el nuevo paso del
 * wizard de Cotización (ver el doc-comment de `RequirementsService`).
 * Controlador propio (no dentro de `QuotesController`) porque
 * `RequirementsService` también lo usa `ContractsService` -- separarlo
 * en su propio módulo evita un ciclo `QuotingModule` <-> `ContractsModule`.
 */
@Controller('quotes/:ideQuote/requirements')
export class RequirementsController {
  constructor(private readonly service: RequirementsService) {}

  @Get()
  list(@Param('ideQuote') ideQuote: string, @CurrentUser() actor: JwtPayload) {
    return this.service.listForQuote(ideQuote, actor.code);
  }

  @Patch(':ideQuoteRequirement')
  setDelivered(
    @Param('ideQuoteRequirement') ideQuoteRequirement: string,
    @Body() dto: SetQuoteRequirementDeliveredDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.setQuoteRequirementDelivered(ideQuoteRequirement, dto.delivered, actor.code);
  }
}
