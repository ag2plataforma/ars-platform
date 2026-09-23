import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { BrokerTypesService } from './broker-types.service';
import { CreateBrokerTypeDto } from './dto/create-broker-type.dto';
import { UpdateBrokerTypeDto } from './dto/update-broker-type.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';

/**
 * Catálogo `SBrokerType`. Lectura abierta a cualquier usuario
 * autenticado; creación/edición restringidas a ADMIN, igual que el
 * resto de los catálogos simples de este proyecto.
 */
@Controller('broker-types')
export class BrokerTypesController {
  constructor(private readonly service: BrokerTypesService) {}

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
  create(@Body() dto: CreateBrokerTypeDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBrokerTypeDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
