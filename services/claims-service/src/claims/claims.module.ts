import { Module } from '@nestjs/common';
import { ClaimsStateMachineModule } from '../state-machine/claims-state-machine.module';
import { ClaimRequirementsModule } from '../requirements/claim-requirements.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

/** Ver el doc-comment de `ClaimsService`. */
@Module({
  imports: [ClaimsStateMachineModule, ClaimRequirementsModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
