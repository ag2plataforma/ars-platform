import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { DistributionWaysService } from './distribution-ways.service';
import { CreateDistributionWayDto } from './dto/create-distribution-way.dto';
import { UpdateDistributionWayDto } from './dto/update-distribution-way.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';

/**
 * Catálogo `SDistributionWay` -- uno de los dos prerequisitos de
 * `CreateQuoteDto` (junto con `SDistributionChannel`) que hasta ahora
 * ningún servicio exponía por API (ver `underwriting-service`/
 * `quotes.service.ts#resolveDistributionWay`).
 */
@Controller('distribution-ways')
export class DistributionWaysController {
  constructor(private readonly service: DistributionWaysService) {}

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
  create(@Body() dto: CreateDistributionWayDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDistributionWayDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
