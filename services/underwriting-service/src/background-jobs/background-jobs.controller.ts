import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { BackgroundJobsService } from './background-jobs.service';
import { UpdateBackgroundJobConfigDto } from './dto/update-background-job-config.dto';
import { ListBackgroundJobRunsDto } from './dto/list-background-job-runs.dto';

/**
 * Pantalla genérica "Trabajos Programados" (ver docs/02-roadmap.md) --
 * administración de cualquier `BackgroundJobHandler` registrado
 * (horario, activar/desactivar, "ejecutar ahora", historial de
 * corridas). Rutas parametrizadas por `:codJob`, no una por feature.
 */
@Controller('background-jobs')
export class BackgroundJobsController {
  constructor(private readonly service: BackgroundJobsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Patch(':codJob/config')
  updateConfig(
    @Param('codJob') codJob: string,
    @Body() dto: UpdateBackgroundJobConfigDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.updateConfig(codJob, dto, actor.code);
  }

  @Get(':codJob/runs')
  listRuns(@Param('codJob') codJob: string, @Query() query: ListBackgroundJobRunsDto) {
    return this.service.listRuns(codJob, query);
  }

  @Post(':codJob/runs/run-now')
  runNow(@Param('codJob') codJob: string, @CurrentUser() actor: JwtPayload) {
    return this.service.runNow(codJob, actor.code);
  }
}
