import { Body, Controller, Delete, Get, Param, ParseBoolPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { StateMachineAdminService } from './state-machine-admin.service';
import {
  CreateEntityDto,
  CreateRuleDto,
  CreateStateDto,
  UpdateEntityDto,
  UpdateRuleDto,
  UpdateStateDto,
} from './dto/state-machine-admin.dto';

/**
 * Administración de la máquina de estados global (ver
 * `StateMachineAdminService`). Lectura para cualquier usuario autenticado;
 * toda escritura es solo `ADMIN` -- un error acá puede bloquear contratos o
 * siniestros.
 */
@Controller('state-machine-admin')
export class StateMachineAdminController {
  constructor(private readonly service: StateMachineAdminService) {}

  @Get('states')
  listStates() {
    return this.service.listStates();
  }

  @Roles('ADMIN')
  @Post('states')
  createState(@Body() dto: CreateStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.createState(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch('states/:id')
  updateState(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.updateState(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Delete('states/:id')
  deleteState(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteState(id);
  }

  @Get('entities')
  listEntities() {
    return this.service.listEntities();
  }

  @Roles('ADMIN')
  @Post('entities')
  createEntity(@Body() dto: CreateEntityDto, @CurrentUser() actor: JwtPayload) {
    return this.service.createEntity(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch('entities/:id')
  updateEntity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEntityDto, @CurrentUser() actor: JwtPayload) {
    return this.service.updateEntity(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Delete('entities/:id')
  deleteEntity(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteEntity(id);
  }

  @Get('entities/:id/rules')
  listRules(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listRules(id);
  }

  @Roles('ADMIN')
  @Post('rules')
  createRule(@Body() dto: CreateRuleDto, @CurrentUser() actor: JwtPayload) {
    return this.service.createRule(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch('rules/:id')
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRuleDto, @CurrentUser() actor: JwtPayload) {
    return this.service.updateRule(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Delete('rules/:id')
  deleteRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('force', new ParseBoolPipe({ optional: true })) force?: boolean,
  ) {
    return this.service.deleteRule(id, force === true);
  }

  @Get('diagnostics')
  diagnostics() {
    return this.service.diagnostics();
  }
}
