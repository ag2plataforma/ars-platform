import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { RiskLevelsService } from './risk-levels.service';
import { CreateRiskLevelDto } from './dto/create-risk-level.dto';
import { UpdateRiskLevelDto } from './dto/update-risk-level.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';

/**
 * Catálogo `SRiskLevel`. Lectura abierta a cualquier usuario autenticado
 * (lo van a consumir otros servicios/pantallas al armar productos y
 * cotizaciones); creación/edición restringidas a ADMIN, igual que
 * `UsersController` en iam-service.
 */
@Controller('risk-levels')
export class RiskLevelsController {
  constructor(private readonly service: RiskLevelsService) {}

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
  create(@Body() dto: CreateRiskLevelDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRiskLevelDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(
    @Param('id') id: string,
    @Body() dto: SetCatalogStateDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
