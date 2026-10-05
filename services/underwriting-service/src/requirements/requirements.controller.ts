import { Body, Controller, Get, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { RequirementsService } from './requirements.service';
import { SetQuoteRequirementDeliveredDto } from './dto/set-quote-requirement-delivered.dto';
import { UploadRequirementFileDto } from './dto/upload-requirement-file.dto';
import { ConfirmExtractionDto } from './dto/confirm-extraction.dto';
import { RequirementExtractionService } from './requirement-extraction.service';

/**
 * Endpoints del checklist de Requisitos consumidos por el nuevo paso del
 * wizard de Cotización (ver el doc-comment de `RequirementsService`).
 * Controlador propio (no dentro de `QuotesController`) porque
 * `RequirementsService` también lo usa `ContractsService` -- separarlo
 * en su propio módulo evita un ciclo `QuotingModule` <-> `ContractsModule`.
 */
@Controller('quotes/:ideQuote/requirements')
export class RequirementsController {
  constructor(
    private readonly service: RequirementsService,
    private readonly extraction: RequirementExtractionService,
  ) {}

  /** IA (Fase 4): propone los datos del documento; NO guarda nada hasta `PATCH :id/extraction`. */
  @Post(':ideQuoteRequirement/extract')
  extract(@Param('ideQuoteRequirement') id: string, @CurrentUser() actor: JwtPayload) {
    return this.extraction.extract('QUOTE', id, actor.code);
  }

  /** Guarda los datos ya revisados por el operador en `Data.extraction`. */
  @Patch(':ideQuoteRequirement/extraction')
  confirmExtraction(
    @Param('ideQuoteRequirement') id: string,
    @Body() dto: ConfirmExtractionDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.extraction.confirm('QUOTE', id, dto, actor.code);
  }

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

  /** Subida real de archivo (Etapa 2, ver docs/02-roadmap.md ítem 4). */
  @Patch(':ideQuoteRequirement/file')
  uploadFile(
    @Param('ideQuoteRequirement') ideQuoteRequirement: string,
    @Body() dto: UploadRequirementFileDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.uploadQuoteRequirementFile(ideQuoteRequirement, dto, actor.code);
  }

  @Get(':ideQuoteRequirement/file')
  async downloadFile(@Param('ideQuoteRequirement') ideQuoteRequirement: string, @Res() res: Response) {
    const { bytes, desFileName } = await this.service.downloadQuoteRequirementFile(ideQuoteRequirement);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${desFileName}"`);
    res.send(bytes);
  }
}
