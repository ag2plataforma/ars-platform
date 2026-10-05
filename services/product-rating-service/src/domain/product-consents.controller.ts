import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ProductConsentsService } from './product-consents.service';
import { CreateProductConsentDto } from './dto/create-product-consent.dto';
import { ListProductConsentsDto } from './dto/list-product-consents.dto';

@Controller('product-consents')
export class ProductConsentsController {
  constructor(private readonly service: ProductConsentsService) {}

  @Get()
  findAll(@Query() query: ListProductConsentsDto) {
    return this.service.findAll(query);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateProductConsentDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
