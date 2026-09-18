import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { SiteMapRolesService } from './site-map-roles.service';
import { CreateSiteMapRoleDto } from './dto/create-site-map-role.dto';
import { ListSiteMapRolesDto } from './dto/list-site-map-roles.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';

@Controller('site-map-roles')
export class SiteMapRolesController {
  constructor(private readonly service: SiteMapRolesService) {}

  @Get()
  findAll(@Query() query: ListSiteMapRolesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateSiteMapRoleDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
