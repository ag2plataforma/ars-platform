import { Module } from '@nestjs/common';
import { ClaimsStateMachineModule } from '../state-machine/claims-state-machine.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { GuaranteeProvisionsService } from './guarantee-provisions.service';
import { ClaimPaymentsService } from './claim-payments.service';

/** Fase 4 (Siniestros), Etapa 2 -- ver el doc-comment de `ApprovalsService`. */
@Module({
  imports: [ClaimsStateMachineModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, GuaranteeProvisionsService, ClaimPaymentsService],
})
export class ApprovalsModule {}
