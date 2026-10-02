import { Body, Controller, Get, Param, Patch, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { RequirementsService } from './requirements.service';
import { UploadRequirementFileDto } from './dto/upload-requirement-file.dto';

/**
 * Subida/descarga del archivo real de un `TContractRequirement` --
 * Etapa 2 de "Requisitos" (ver docs/02-roadmap.md ítem 4). Controlador
 * propio, sin `:ideContract` en el path (`IdeContractRequirement` ya es
 * la PK, no hace falta el contrato padre para resolverlo) -- mismo
 * criterio de ruta plana que `TemplatesController.replaceFile` en
 * documents-service (`:id/file`). La pestaña "Requisitos" del detalle
 * de contrato (hasta ahora de solo lectura, sin archivo ni "Entregado")
 * pasa a usar esto.
 */
@Controller('contract-requirements')
export class ContractRequirementsController {
  constructor(private readonly service: RequirementsService) {}

  @Patch(':ideContractRequirement/file')
  uploadFile(
    @Param('ideContractRequirement') ideContractRequirement: string,
    @Body() dto: UploadRequirementFileDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.uploadContractRequirementFile(ideContractRequirement, dto, actor.code);
  }

  @Get(':ideContractRequirement/file')
  async downloadFile(@Param('ideContractRequirement') ideContractRequirement: string, @Res() res: Response) {
    const { bytes, desFileName } = await this.service.downloadContractRequirementFile(ideContractRequirement);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${desFileName}"`);
    res.send(bytes);
  }
}
