import { Module } from '@nestjs/common';
import { UnderwritingStateMachineModule } from '../state-machine/underwriting-state-machine.module';
import { UnderwritingRulesEngineModule } from '../rules-engine/underwriting-rules-engine.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

/**
 * Fase 1 del motor de cotización real (`FQuote`/`FQuoteRiskPlan`/
 * `FQuoteCoverage`/`FQuoteCoverageConcept`), confirmado contra código y
 * datos reales (ver `packages/database/scripts/investigate-quote-engine.js`
 * y docs/02-roadmap.md). Reutiliza el motor de estados y el motor de
 * reglas ya construidos y validados, sin modificarlos.
 */
@Module({
  imports: [UnderwritingStateMachineModule, UnderwritingRulesEngineModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotingModule {}
