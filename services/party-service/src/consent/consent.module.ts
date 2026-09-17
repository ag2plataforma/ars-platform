import { Module } from '@nestjs/common';
import { PartyStateMachineModule } from '../state-machine/party-state-machine.module';
import { ConsentsController } from './consents.controller';
import { PersonConsentsController } from './person-consents.controller';
import { ConsentsService } from './consents.service';

/**
 * Segunda mitad del alcance de party-service (ver su README):
 * consentimiento GDPR (`SConsent`/`TPersonConsent`, equivalente a
 * `FConsent`). Personas y roles viven en `PersonsModule` (módulo
 * separado, ver `../persons/`).
 */
@Module({
  imports: [PartyStateMachineModule],
  controllers: [ConsentsController, PersonConsentsController],
  providers: [ConsentsService],
})
export class ConsentModule {}
