import { Controller, Get, Param } from '@nestjs/common';
import { StateMachineService } from '@ars-platform/shared-common';

/**
 * Controller temporal para validar en caliente que la máquina de estados
 * funciona contra el esquema real (ars_platform). No es API de negocio —
 * se retira cuando ya haya endpoints reales de dominio que la usen.
 *
 * Ya no es público: requiere Bearer token (como cualquier ruta que no
 * lleve @Public()) — haz POST /auth/login primero.
 *
 * Pruébalo con datos reales que existan en tu SEntity/SStateRule/SState,
 * por ejemplo:
 *   GET /state-machine/state/ACTIVO
 *   GET /state-machine/initial/QUOTE   (si "QUOTE" es un CodEntity real)
 */
@Controller('state-machine')
export class StateMachineTestController {
  constructor(private readonly stateMachine: StateMachineService) {}

  @Get('state/:code')
  getStateByCode(@Param('code') code: string) {
    return this.stateMachine.getStateByCode(code);
  }

  @Get('initial/:codEntity')
  getInitialState(@Param('codEntity') codEntity: string) {
    return this.stateMachine.getInitialState(codEntity);
  }

  @Get('next/:codEntity/:currentStateId/:operativeCode')
  getNextState(
    @Param('codEntity') codEntity: string,
    @Param('currentStateId') currentStateId: string,
    @Param('operativeCode') operativeCode: string,
  ) {
    return this.stateMachine.getNextState(codEntity, currentStateId, operativeCode);
  }
}
