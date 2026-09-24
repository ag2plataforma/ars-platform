import { Module } from '@nestjs/common';
import { ClaimsStateMachineModule } from '../state-machine/claims-state-machine.module';
import { ClaimTypesController } from './claim-types/claim-types.controller';
import { ClaimTypesService } from './claim-types/claim-types.service';
import { ClaimEventsController } from './claim-events/claim-events.controller';
import { ClaimEventsService } from './claim-events/claim-events.service';

/**
 * Catálogos propios de Siniestros (Fase 4, Etapa 1, 2026-09-24):
 * `SClaimType` (tipo de siniestro) y `SClaimEvent` (evento concreto
 * dentro de un tipo). Ver el doc-comment de `ClaimTypesService` para el
 * análisis completo -- primer módulo real de `claims-service` (antes
 * solo tenía el `HealthController` de scaffold).
 */
@Module({
  imports: [ClaimsStateMachineModule],
  controllers: [ClaimTypesController, ClaimEventsController],
  providers: [ClaimTypesService, ClaimEventsService],
  exports: [ClaimTypesService, ClaimEventsService],
})
export class CatalogsModule {}
