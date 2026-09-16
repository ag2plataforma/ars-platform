import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { CalculationRulesService } from './calculation-rules.service';
import { CreateCalculationRuleDto } from './dto/create-calculation-rule.dto';
import { UpdateCalculationRuleDto } from './dto/update-calculation-rule.dto';
import { ListCalculationRulesDto } from './dto/list-calculation-rules.dto';
import { SetCatalogStateDto } from '../catalogs/dto/set-catalog-state.dto';

/**
 * CRUD real de `SCalculationRule` — reemplaza a `db:seed-example-rules`
 * como forma de dar de alta fórmulas. Los endpoints de prueba
 * `/rules-engine/*` (evaluación) siguen aparte, sin cambios.
 */
@Controller('calculation-rules')
export class CalculationRulesController {
  constructor(private readonly service: CalculationRulesService) {}

  @Get()
  findAll(@Query() query: ListCalculationRulesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateCalculationRuleDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCalculationRuleDto,
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
