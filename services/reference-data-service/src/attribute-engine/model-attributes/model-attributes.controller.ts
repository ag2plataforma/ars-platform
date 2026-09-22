import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ModelAttributesService } from './model-attributes.service';
import { CreateModelAttributeDto } from './dto/create-model-attribute.dto';
import { UpdateModelAttributeDto } from './dto/update-model-attribute.dto';
import { SetCatalogStateDto } from '../dto/set-catalog-state.dto';

@Controller('model-attributes')
export class ModelAttributesController {
  constructor(private readonly service: ModelAttributesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /**
   * Schema de formulario dinámico para un `IdeReference` (hoy siempre un
   * `IdeRiskProduct`) -- lo consume el wizard de Cotización para pintar
   * los campos personalizados de cada riesgo agregado (ver
   * `ModelAttributesService.getSchemaForReference`).
   */
  @Get('by-reference/:ideReference/schema')
  getSchema(@Param('ideReference') ideReference: string) {
    return this.service.getSchemaForReference(ideReference);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateModelAttributeDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateModelAttributeDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
