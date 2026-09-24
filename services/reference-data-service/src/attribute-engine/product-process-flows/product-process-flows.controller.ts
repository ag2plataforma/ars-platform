import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ProductProcessFlowsService } from './product-process-flows.service';
import { CreateProductProcessFlowDto } from './dto/create-product-process-flow.dto';
import { UpdateProductProcessFlowDto } from './dto/update-product-process-flow.dto';
import { ResolveStepsQueryDto } from './dto/resolve-steps-query.dto';
import { SetCatalogStateDto } from '../dto/set-catalog-state.dto';

@Controller('product-process-flows')
export class ProductProcessFlowsController {
  constructor(private readonly service: ProductProcessFlowsService) {}

  // OJO -- 'resolve-steps' debe declararse ANTES de ':id' para que Nest
  // no lo confunda con un id (mismo problema resuelto antes con
  // `GET /persons/search` en party-service).
  @Get('resolve-steps')
  resolveSteps(@Query() query: ResolveStepsQueryDto) {
    return this.service.resolveSteps(query);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateProductProcessFlowDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductProcessFlowDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
