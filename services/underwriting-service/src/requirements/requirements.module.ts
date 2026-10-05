import { Module } from '@nestjs/common';
import { UnderwritingStateMachineModule } from '../state-machine/underwriting-state-machine.module';
import { RequirementsController } from './requirements.controller';
import { ContractRequirementsController } from './contract-requirements.controller';
import { RequirementsService } from './requirements.service';
import { RequirementExtractionService } from './requirement-extraction.service';

/**
 * Ver el doc-comment de `RequirementsService`. Exporta el servicio para
 * que `ContractsModule` lo use dentro de `copyRisksAndCoverages` sin
 * duplicar el algoritmo de resolución. `ContractRequirementsController`
 * agregado en la Etapa 2 (archivo real de `TContractRequirement`, ver
 * docs/02-roadmap.md ítem 4).
 */
@Module({
  imports: [UnderwritingStateMachineModule],
  controllers: [RequirementsController, ContractRequirementsController],
  providers: [RequirementsService, RequirementExtractionService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
