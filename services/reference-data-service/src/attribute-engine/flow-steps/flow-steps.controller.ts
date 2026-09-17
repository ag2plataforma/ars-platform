import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { FlowStepsService } from './flow-steps.service';
import { CreateFlowStepDto } from './dto/create-flow-step.dto';
import { UpdateFlowStepDto } from './dto/update-flow-step.dto';
import { SetCatalogStateDto } from '../dto/set-catalog-state.dto';

@Controller('flow-steps')
export class FlowStepsController {
  constructor(private readonly service: FlowStepsService) {}

  @Get()
  findAll(@Query('codProcessFlow') codProcessFlow?: string) {
    return this.service.findAll(codProcessFlow);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateFlowStepDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFlowStepDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
