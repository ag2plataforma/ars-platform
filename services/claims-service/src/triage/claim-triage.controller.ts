import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ClaimTriageService } from './claim-triage.service';
import { DecideTriageDto } from './dto/decide-triage.dto';

/** Ver el doc-comment de `ClaimTriageService`. */
@Controller('claim-files/:ideClaimFile/triage')
export class ClaimTriageController {
  constructor(private readonly service: ClaimTriageService) {}

  /** Último triage de la carpeta (o `null`). */
  @Get()
  async latest(@Param('ideClaimFile') ideClaimFile: string) {
    return (await this.service.getLatest(ideClaimFile)) ?? null;
  }

  /** Pide un triage a la IA (propone; no decide nada). */
  @Roles('CLAIMS_ADJUSTER', 'CLAIMS_MANAGER', 'CLAIMS_DIRECTOR', 'ADMIN')
  @Post()
  run(@Param('ideClaimFile') ideClaimFile: string, @CurrentUser() actor: JwtPayload) {
    return this.service.run(ideClaimFile, actor.code);
  }

  /** Confirma o cambia la prioridad sugerida. */
  @Roles('CLAIMS_ADJUSTER', 'CLAIMS_MANAGER', 'CLAIMS_DIRECTOR', 'ADMIN')
  @Patch('decision')
  decide(@Param('ideClaimFile') ideClaimFile: string, @Body() dto: DecideTriageDto, @CurrentUser() actor: JwtPayload) {
    return this.service.decide(ideClaimFile, dto.codPriority, dto.note, actor.code);
  }
}
