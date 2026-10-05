import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { RiskFieldsService } from './risk-fields.service';
import { CreateRiskFieldDto, UpdateRiskFieldDto } from './dto/risk-field.dto';
import { SetCatalogStateDto } from '../dto/set-catalog-state.dto';

/** Campos personalizados por tipo de riesgo (configuración simplificada del motor de atributos). */
@Controller('risk-fields')
export class RiskFieldsController {
  constructor(private readonly service: RiskFieldsService) {}

  @Get('dictionaries')
  listDictionaries() {
    return this.service.listDictionaries();
  }

  @Get('by-risk-product/:ideRiskProduct')
  findByRiskProduct(@Param('ideRiskProduct', ParseUUIDPipe) ideRiskProduct: string) {
    return this.service.findByRiskProduct(ideRiskProduct);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateRiskFieldDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRiskFieldDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
