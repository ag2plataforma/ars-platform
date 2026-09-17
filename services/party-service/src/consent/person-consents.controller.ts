import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { ConsentsService } from './consents.service';
import { RecordConsentDto } from './dto/record-consent.dto';

/**
 * Registro de aceptación de consentimiento por persona (`TPersonConsent`).
 * Fase 1: solo ligado a una cotización (`ideQuote`) -- `IdeContractOperation`
 * queda para cuando exista la fase de contratación real.
 */
@Controller('persons/:personId/consents')
export class PersonConsentsController {
  constructor(private readonly service: ConsentsService) {}

  @Post()
  accept(@Param('personId') personId: string, @Body() dto: RecordConsentDto, @CurrentUser() actor: JwtPayload) {
    return this.service.recordAcceptance(personId, dto, actor.code);
  }

  @Get()
  list(@Param('personId') personId: string, @Query('ideQuote') ideQuote?: string) {
    return this.service.listForPerson(personId, ideQuote);
  }
}
