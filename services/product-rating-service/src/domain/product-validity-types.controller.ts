import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ProductValidityTypesService } from './product-validity-types.service';
import { CreateProductValidityTypeDto } from './dto/create-product-validity-type.dto';
import { UpdateProductValidityTypeDto } from './dto/update-product-validity-type.dto';
import { ListProductValidityTypesDto } from './dto/list-product-validity-types.dto';
import { SetCatalogStateDto } from '../catalogs/dto/set-catalog-state.dto';

@Controller('product-validity-types')
export class ProductValidityTypesController {
  constructor(private readonly service: ProductValidityTypesService) {}

  @Get()
  findAll(@Query() query: ListProductValidityTypesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateProductValidityTypeDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductValidityTypeDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
