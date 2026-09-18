import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { TextContentService } from './text-content.service';
import { CreateTextContentDto } from './dto/create-text-content.dto';
import { SetCatalogStateDto } from './dto/set-catalog-state.dto';

@Controller('text-content')
export class TextContentController {
  constructor(private readonly service: TextContentService) {}

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
  create(@Body() dto: CreateTextContentDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
