import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { PlanProductRisksService } from './plan-product-risks.service';
import { CreatePlanProductRiskDto } from './dto/create-plan-product-risk.dto';
import { UpdatePlanProductRiskDto } from './dto/update-plan-product-risk.dto';
import { ListPlanProductRisksDto } from './dto/list-plan-product-risks.dto';
import { SetCatalogStateDto } from '../catalogs/dto/set-catalog-state.dto';

@Controller('plan-product-risks')
export class PlanProductRisksController {
  constructor(private readonly service: PlanProductRisksService) {}

  @Get()
  findAll(@Query() query: ListPlanProductRisksDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreatePlanProductRiskDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanProductRiskDto,
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
