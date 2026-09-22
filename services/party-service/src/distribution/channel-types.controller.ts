import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ChannelTypesService } from './channel-types.service';
import { CreateChannelTypeDto } from './dto/create-channel-type.dto';
import { UpdateChannelTypeDto } from './dto/update-channel-type.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';

/**
 * Catálogo `SChannelType`. Lectura abierta a cualquier usuario
 * autenticado; creación/edición restringidas a ADMIN, igual que el
 * resto de los catálogos simples de este proyecto.
 */
@Controller('channel-types')
export class ChannelTypesController {
  constructor(private readonly service: ChannelTypesService) {}

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
  create(@Body() dto: CreateChannelTypeDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChannelTypeDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
