import { Module } from '@nestjs/common';
import { StateMachineAdminController } from './state-machine-admin.controller';
import { StateMachineAdminService } from './state-machine-admin.service';

/** Pantalla "Máquina de estados" (admin de `SState`/`SEntity`/`SStateRule`). */
@Module({
  controllers: [StateMachineAdminController],
  providers: [StateMachineAdminService],
})
export class StateMachineAdminModule {}
