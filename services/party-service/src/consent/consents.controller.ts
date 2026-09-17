import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ConsentsService } from './consents.service';
import { CreateConsentDto } from './dto/create-consent.dto';
import { UpdateConsentDto } from './dto/update-consent.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';
import { GetApplicableConsentsDto } from './dto/get-applicable-consents.dto';

@Controller('consents')
export class ConsentsController {
  constructor(private readonly service: ConsentsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  // Antes de ':id' a propósito -- si no, Nest la matchea como :id="applicable".
  @Get('applicable')
  findApplicable(@Query() query: GetApplicableConsentsDto) {
    return this.service.findApplicable(query.codProduct);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateConsentDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConsentDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
