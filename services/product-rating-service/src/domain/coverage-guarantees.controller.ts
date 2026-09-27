import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { CoverageGuaranteesService } from './coverage-guarantees.service';
import { CreateCoverageGuaranteeDto } from './dto/create-coverage-guarantee.dto';
import { UpdateCoverageGuaranteeDto } from './dto/update-coverage-guarantee.dto';
import { ListCoverageGuaranteesDto } from './dto/list-coverage-guarantees.dto';
import { SetCatalogStateDto } from '../catalogs/dto/set-catalog-state.dto';

@Controller('coverage-guarantees')
export class CoverageGuaranteesController {
  constructor(private readonly service: CoverageGuaranteesService) {}

  @Get()
  findAll(@Query() query: ListCoverageGuaranteesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateCoverageGuaranteeDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCoverageGuaranteeDto,
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
