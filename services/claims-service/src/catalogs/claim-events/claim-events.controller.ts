import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ClaimEventsService } from './claim-events.service';
import { CreateClaimEventDto } from './dto/create-claim-event.dto';
import { UpdateClaimEventDto } from './dto/update-claim-event.dto';
import { SetCatalogStateDto } from '../set-catalog-state.dto';

@Controller('claim-events')
export class ClaimEventsController {
  constructor(private readonly service: ClaimEventsService) {}

  @Get()
  findAll(@Query('codClaimType') codClaimType?: string) {
    return this.service.findAll(codClaimType);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateClaimEventDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClaimEventDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
