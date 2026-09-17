import { Controller, Get, Param } from '@nestjs/common';
import { EntitiesService } from './entities.service';

@Controller('entities')
export class EntitiesController {
  constructor(private readonly service: EntitiesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
