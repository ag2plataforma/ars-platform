import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { CommissionProductsService } from './commission-products.service';
import { CreateCommissionProductDto } from './dto/create-commission-product.dto';
import { UpdateCommissionProductDto } from './dto/update-commission-product.dto';
import { ListCommissionProductsDto } from './dto/list-commission-products.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';

@Controller('commission-products')
export class CommissionProductsController {
  constructor(private readonly service: CommissionProductsService) {}

  @Get()
  findAll(@Query() query: ListCommissionProductsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateCommissionProductDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommissionProductDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
