import { Controller, Get } from '@nestjs/common';
import { ProcessesService } from './processes.service';

@Controller('processes')
export class ProcessesController {
  constructor(private readonly service: ProcessesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
