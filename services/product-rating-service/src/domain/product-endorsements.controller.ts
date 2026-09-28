import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ProductEndorsementsService } from './product-endorsements.service';
import { CreateProductEndorsementDto } from './dto/create-product-endorsement.dto';
import { UpdateProductEndorsementDto } from './dto/update-product-endorsement.dto';
import { ListProductEndorsementsDto } from './dto/list-product-endorsements.dto';
import { SetCatalogStateDto } from '../catalogs/dto/set-catalog-state.dto';

@Controller('product-endorsements')
export class ProductEndorsementsController {
  constructor(private readonly service: ProductEndorsementsService) {}

  @Get()
  findAll(@Query() query: ListProductEndorsementsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateProductEndorsementDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductEndorsementDto,
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
