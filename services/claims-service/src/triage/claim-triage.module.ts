import { Module } from '@nestjs/common';
import { ClaimTriageController } from './claim-triage.controller';
import { ClaimTriageService } from './claim-triage.service';

/** Fase 4 (IA), triage de siniestros -- ver el doc-comment de `ClaimTriageService`. */
@Module({
  controllers: [ClaimTriageController],
  providers: [ClaimTriageService],
  exports: [ClaimTriageService],
})
export class ClaimTriageModule {}
