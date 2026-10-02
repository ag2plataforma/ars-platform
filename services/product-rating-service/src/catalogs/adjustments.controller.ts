import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { AdjustmentsService } from './adjustments.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { UpdateAdjustmentDto } from './dto/update-adjustment.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';

/**
 * Catálogo `SAdjustment` (recargos/descuentos genéricos, ver doc-comment
 * de `AdjustmentsService`). Lectura abierta a cualquier usuario
 * autenticado (lo consume el wizard de cotización para ofrecer los
 * ajustes "Manual" activos); alta/edición/estado restringidas a ADMIN,
 * mismo criterio que el resto de los catálogos de esta carpeta.
 */
@Controller('adjustments')
export class AdjustmentsController {
  constructor(private readonly service: AdjustmentsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateAdjustmentDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdjustmentDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
