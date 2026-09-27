import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '@ars-platform/shared-common';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles('ADMIN')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
