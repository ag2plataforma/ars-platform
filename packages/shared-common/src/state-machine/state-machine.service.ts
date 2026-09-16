import { Injectable, Inject, NotFoundException } from '@nestjs/common';

/**
 * Máquina de estados genérica y configurable, equivalente en TypeScript a la
 * función PL/pgSQL `FGetState` (ver docs/01-especificacion-motor-negocio-actual.md, §2).
 *
 * Diseño: no accede a la base de datos directamente. Depende de un
 * `StateRuleRepository` (puerto) que cada servicio implementa contra las
 * tablas `SEntity` / `SStateRule` / `SState` ya existentes en Postgres —
 * ese modelo de configuración se conserva tal cual, solo cambia el intérprete.
 *
 * TODO (Fase 2): implementar `StateRuleRepository` con TypeORM/Prisma contra
 * el esquema `entity` y conectar este servicio en cada módulo que lo necesite.
 */

export interface StateRuleRepository {
  /** Equivalente a FGetState('INITIAL', codEntity, null, null) */
  findInitialState(codEntity: string): Promise<string | null>;

  /** Equivalente a FGetState('NEXT', codEntity, currentStateId, operativeCode) */
  findNextState(
    codEntity: string,
    currentStateId: string,
    operativeCode: string,
  ): Promise<string | null>;

  /** Equivalente a FGetState('STATE', null, null, stateCode) */
  findStateByCode(stateCode: string): Promise<string | null>;
}

export const STATE_RULE_REPOSITORY = Symbol('STATE_RULE_REPOSITORY');

@Injectable()
export class StateMachineService {
  constructor(
    @Inject(STATE_RULE_REPOSITORY)
    private readonly repository: StateRuleRepository,
  ) {}

  async getInitialState(codEntity: string): Promise<string> {
    const stateId = await this.repository.findInitialState(codEntity);
    if (!stateId) {
      throw new NotFoundException(
        `No hay estado inicial configurado para la entidad "${codEntity}" (SStateRule.IndInitialState)`,
      );
    }
    return stateId;
  }

  async getNextState(
    codEntity: string,
    currentStateId: string,
    operativeCode: string,
  ): Promise<string> {
    const stateId = await this.repository.findNextState(
      codEntity,
      currentStateId,
      operativeCode,
    );
    if (!stateId) {
      // El sistema original NO hace fallback silencioso aquí (a diferencia
      // del motor de reglas) — una transición no configurada es un error.
      throw new NotFoundException(
        `No existe transición configurada para "${codEntity}" desde el estado actual con la operación "${operativeCode}"`,
      );
    }
    return stateId;
  }

  async getStateByCode(stateCode: string): Promise<string> {
    const stateId = await this.repository.findStateByCode(stateCode);
    if (!stateId) {
      throw new NotFoundException(`No existe el estado con código "${stateCode}"`);
    }
    return stateId;
  }
}
