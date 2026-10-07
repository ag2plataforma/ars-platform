import { Controller, Get, Param, Post, Body, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { GenerationService } from './generation.service';
import { GenerateContractDocumentDto } from './dto/generate-contract-document.dto';

/**
 * Ruta estática ('documents/:id/download') ANTES que la dinámica
 * (':ideContract') -- mismo gotcha de orden de rutas ya conocido en este
 * proyecto (ver background-jobs.controller.ts/contracts.controller.ts):
 * si ':ideContract' fuera la primera, Nest le pasaría "documents" como
 * valor de ese parámetro en vez de llegar nunca a la ruta de descarga.
 */
@Controller('generation/contracts')
export class GenerationController {
  constructor(private readonly service: GenerationService) {}

  @Get('documents/:id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { bytes, desFileName } = await this.service.getFile(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${desFileName}"`);
    res.send(bytes);
  }

  @Post(':ideContract')
  generate(
    @Param('ideContract') ideContract: string,
    @Body() dto: GenerateContractDocumentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.generateContractDocument(ideContract, dto.codTemplateType, dto.idePersonRol, actor.code, {
      ideReceipt: dto.ideReceipt,
      ideContractFile: dto.ideContractFile,
      mensaje: dto.mensaje,
    });
  }

  @Get(':ideContract/receipts')
  listReceipts(@Param('ideContract') ideContract: string) {
    return this.service.listReceipts(ideContract);
  }

  @Get(':ideContract')
  listForContract(@Param('ideContract') ideContract: string) {
    return this.service.listForContract(ideContract);
  }
}

/** Cotización en PDF al vuelo -- no se guarda nada (ver
 *  `GenerationService.generateQuotePdf`). `GET` + descarga directa, mismo
 *  patrón que `documents/:id/download`. */
@Controller('generation/quotes')
export class GenerationQuotesController {
  constructor(private readonly service: GenerationService) {}

  @Get(':ideQuote/pdf')
  async quotePdf(
    @Param('ideQuote') ideQuote: string,
    @Query('idePersonRol', new ParseUUIDPipe()) idePersonRol: string,
    @Res() res: Response,
  ) {
    const { bytes, desFileName } = await this.service.generateQuotePdf(ideQuote, idePersonRol);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${desFileName}"`);
    res.send(bytes);
  }
}
