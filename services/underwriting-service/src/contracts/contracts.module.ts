import { Module } from '@nestjs/common';
import { UnderwritingStateMachineModule } from '../state-machine/underwriting-state-machine.module';
import { UnderwritingRulesEngineModule } from '../rules-engine/underwriting-rules-engine.module';
import { QuotingModule } from '../quoting/quoting.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { DocumentsModule } from '../documents/documents.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

/**
 * Cascada de creación de contrato (ver el comentario de cabecera de
 * `ContractsService`). Importa `QuotingModule` (no solo los motores) porque
 * reutiliza `QuotesService.transitionState` para el paso final de la
 * cascada (`FQuote_SetState('Contratar', ...)` sobre la cotización de
 * origen) -- `QuotesService` se exporta desde `QuotingModule` para esto.
 */
@Module({
  imports: [UnderwritingStateMachineModule, UnderwritingRulesEngineModule, QuotingModule, RequirementsModule, DocumentsModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
