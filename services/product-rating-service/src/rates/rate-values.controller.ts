import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { RateValuesService } from './rate-values.service';
import { CreateRateValueDto } from './dto/create-rate-value.dto';
import { UpdateRateValueDto } from './dto/update-rate-value.dto';
import { ListRateValuesDto } from './dto/list-rate-values.dto';
import { GetRateValueDto } from './dto/get-rate-value.dto';
import { SetCatalogStateDto } from '../catalogs/dto/set-catalog-state.dto';

@Controller('rate-values')
export class RateValuesController {
  constructor(private readonly service: RateValuesService) {}

  @Get()
  findAll(@Query() query: ListRateValuesDto) {
    return this.service.findAll(query);
  }

  // Antes de ':id' a propósito -- si no, Nest la matchea como :id="lookup".
  @Get('lookup')
  getRateValue(@Query() query: GetRateValueDto) {
    return this.service.getRateValue(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateRateValueDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRateValueDto,
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
