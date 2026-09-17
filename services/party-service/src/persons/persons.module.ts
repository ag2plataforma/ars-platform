import { Module } from '@nestjs/common';
import { PartyStateMachineModule } from '../state-machine/party-state-machine.module';
import { PersonsController } from './persons.controller';
import { PersonsService } from './persons.service';
import { PersonRolesController } from './person-roles.controller';
import { PersonRolesService } from './person-roles.service';

/**
 * Primera mitad del alcance de party-service (ver su README): personas
 * (`TPerson`/`TAddress`/`TContactData`) + catálogo de roles de persona
 * (`SPersonRol`). Consentimiento GDPR vive en `ConsentModule` (módulo
 * separado, ver `../consent/`).
 */
@Module({
  imports: [PartyStateMachineModule],
  controllers: [PersonsController, PersonRolesController],
  providers: [PersonsService, PersonRolesService],
  exports: [PersonsService],
})
export class PersonsModule {}
