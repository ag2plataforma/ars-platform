import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ProductOperationsService } from './product-operations.service';
import {
  CreateProductOperationDto,
  SetupBaseProductOperationsDto,
} from './dto/create-product-operation.dto';
import { ListProductOperationsDto } from './dto/list-product-operations.dto';
import { SetCatalogStateDto } from '../catalogs/dto/set-catalog-state.dto';

@Controller('product-operations')
export class ProductOperationsController {
  constructor(private readonly service: ProductOperationsService) {}

  @Get()
  findAll(@Query() query: ListProductOperationsDto) {
    return this.service.findAll(query);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateProductOperationDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  /** Crea las operaciones base (CONTGENE, RECEGENE, RENOVGENE) que le falten al producto. */
  @Roles('ADMIN')
  @Post('setup-base')
  setupBase(@Body() dto: SetupBaseProductOperationsDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setupBase(dto.codProduct, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
