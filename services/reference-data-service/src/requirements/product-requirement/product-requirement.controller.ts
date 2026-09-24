import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ProductRequirementService } from './product-requirement.service';
import { CreateProductRequirementDto } from './dto/create-product-requirement.dto';
import { UpdateProductRequirementDto } from './dto/update-product-requirement.dto';
import { SetCatalogStateDto } from '../dto/set-catalog-state.dto';

@Controller('product-requirements')
export class ProductRequirementController {
  constructor(private readonly service: ProductRequirementService) {}

  @Get()
  findAll(@Query('codProduct') codProduct?: string, @Query('codProcess') codProcess?: string) {
    return this.service.findAll(codProduct, codProcess);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateProductRequirementDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductRequirementDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
