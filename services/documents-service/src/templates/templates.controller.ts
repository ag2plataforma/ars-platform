import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, ReplaceTemplateFileDto, SetTemplateStateDto } from './dto/create-template.dto';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  findByOperationProduct(@Query('ideOperationProduct') ideOperationProduct: string) {
    return this.service.findByOperationProduct(ideOperationProduct);
  }

  @Post()
  create(@Body() dto: CreateTemplateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Patch(':id/file')
  replaceFile(@Param('id') id: string, @Body() dto: ReplaceTemplateFileDto, @CurrentUser() actor: JwtPayload) {
    return this.service.replaceFile(id, dto, actor.code);
  }

  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetTemplateStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.active, actor.code);
  }
}
