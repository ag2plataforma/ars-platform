import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { CommissionTablesService } from './commission-tables.service';
import { CreateCommissionTableDto } from './dto/create-commission-table.dto';
import { UpdateCommissionTableDto } from './dto/update-commission-table.dto';
import { ListCommissionTablesDto } from './dto/list-commission-tables.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';

@Controller('commission-tables')
export class CommissionTablesController {
  constructor(private readonly service: CommissionTablesService) {}

  @Get()
  findAll(@Query() query: ListCommissionTablesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateCommissionTableDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommissionTableDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
