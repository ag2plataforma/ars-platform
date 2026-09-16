import { Injectable } from '@nestjs/common';
import { StateRuleRepository } from '@ars-platform/shared-common';
import { PrismaService } from '../prisma.service';

/**
 * Implementación real de StateRuleRepository (contrato definido en
 * @ars-platform/shared-common) contra las tablas SEntity/SStateRule/SState,
 * replicando exactamente la lógica de la función PL/pgSQL `FGetState`
 * (ver docs/01-especificacion-motor-negocio-actual.md, §2):
 *
 *  - INITIAL devuelve SStateRule.IdeStateFrom (no IdeStateTo) de la fila
 *    marcada con IndInitialState=true para la entidad — así está en el
 *    original, se preserva tal cual.
 *  - NEXT devuelve SStateRule.IdeStateTo dado el estado actual (IdeStateFrom)
 *    y el código operativo.
 *  - STATE busca en SState por CodState en mayúsculas.
 */
@Injectable()
export class PrismaStateRuleRepository implements StateRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findInitialState(codEntity: string): Promise<string | null> {
    const rule = await this.prisma.sStateRule.findFirst({
      where: {
        IndInitialState: true,
        SEntity: { CodEntity: codEntity },
      },
      select: { IdeStateFrom: true },
    });
    return rule?.IdeStateFrom ?? null;
  }

  async findNextState(
    codEntity: string,
    currentStateId: string,
    operativeCode: string,
  ): Promise<string | null> {
    const rule = await this.prisma.sStateRule.findFirst({
      where: {
        IdeStateFrom: currentStateId,
        DesOperativeCode: operativeCode,
        SEntity: { CodEntity: codEntity },
      },
      select: { IdeStateTo: true },
    });
    return rule?.IdeStateTo ?? null;
  }

  async findStateByCode(stateCode: string): Promise<string | null> {
    const state = await this.prisma.sState.findFirst({
      where: { CodState: stateCode.toUpperCase() },
      select: { IdeState: true },
    });
    return state?.IdeState ?? null;
  }
}
