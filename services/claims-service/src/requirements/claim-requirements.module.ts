import { Module } from '@nestjs/common';
import { ClaimsStateMachineModule } from '../state-machine/claims-state-machine.module';
import { ClaimRequirementsController } from './claim-requirements.controller';
import { ClaimRequirementsService } from './claim-requirements.service';

/**
 * Ver el doc-comment de `ClaimRequirementsService`. Exporta el servicio
 * para que `ClaimsModule` lo use dentro de la cascada de declaración de
 * siniestro (`ClaimsService.declare`), mismo criterio que
 * `RequirementsModule`/`ContractsModule` en `underwriting-service`.
 */
@Module({
  imports: [ClaimsStateMachineModule],
  controllers: [ClaimRequirementsController],
  providers: [ClaimRequirementsService],
  exports: [ClaimRequirementsService],
})
export class ClaimRequirementsModule {}
