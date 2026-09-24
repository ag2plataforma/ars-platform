import { Module } from '@nestjs/common';
import { UnderwritingStateMachineModule } from '../state-machine/underwriting-state-machine.module';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';

/**
 * Ver el doc-comment de `RequirementsService`. Exporta el servicio para
 * que `ContractsModule` lo use dentro de `copyRisksAndCoverages` sin
 * duplicar el algoritmo de resolución.
 */
@Module({
  imports: [UnderwritingStateMachineModule],
  controllers: [RequirementsController],
  providers: [RequirementsService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
