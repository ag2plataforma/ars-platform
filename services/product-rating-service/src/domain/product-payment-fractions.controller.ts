import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ProductPaymentFractionsService } from './product-payment-fractions.service';
import { CreateProductPaymentFractionDto } from './dto/create-product-payment-fraction.dto';
import { UpdateProductPaymentFractionDto } from './dto/update-product-payment-fraction.dto';
import { ListProductPaymentFractionsDto } from './dto/list-product-payment-fractions.dto';
import { SetCatalogStateDto } from '../catalogs/dto/set-catalog-state.dto';

@Controller('product-payment-fractions')
export class ProductPaymentFractionsController {
  constructor(private readonly service: ProductPaymentFractionsService) {}

  @Get()
  findAll(@Query() query: ListProductPaymentFractionsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateProductPaymentFractionDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductPaymentFractionDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
