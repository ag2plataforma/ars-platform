import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import {
  CreateEntityDto,
  CreateRuleDto,
  CreateStateDto,
  UpdateEntityDto,
  UpdateRuleDto,
  UpdateStateDto,
} from './dto/state-machine-admin.dto';

/** Operativos "sin transición" -- la regla inicial de una entidad usa uno
 *  de estos (el legado mezcla `-`, vacío y NULL). No cuentan para la
 *  detección de reglas ambiguas. */
const NO_OPERATION = new Set(['', '-']);

/** Error 409 con el detalle estructurado que la pantalla muestra (ej. cuántas
 *  filas quedarían varadas al borrar una regla). */
class RowsInStateConflict extends ConflictException {
  constructor(message: string, rowsInFromState: number) {
    super({ statusCode: 409, message, code: 'ROWS_IN_STATE', rowsInFromState });
  }
}

/**
 * Administración de la máquina de estados GLOBAL (`SState`/`SEntity`/
 * `SStateRule`). Es la configuración de la que depende TODO el ciclo de
 * vida de cotizaciones, contratos y siniestros (`StateMachineService.
 * getNextState`/`getInitialState` leen estas tablas en cada transición, sin
 * caché: un cambio acá rige de inmediato) -- por eso todas las escrituras
 * validan antes de tocar nada:
 *
 *  - No se permiten dos reglas con el mismo (entidad, origen, operación) y
 *    destinos DISTINTOS (ambigüedad: `findNextState` elige una al azar --
 *    justamente lo que había que limpiar al eliminar los `SEED_*`).
 *  - A lo sumo UNA regla inicial por entidad (`findInitialState` devuelve la
 *    primera que encuentre).
 *  - Las reglas que no son la inicial exigen operación.
 *  - No se borra un estado referenciado por reglas o por filas de datos, ni
 *    una entidad con reglas o referenciada por otras tablas.
 *  - Borrar una regla con filas hoy en su estado de origen exige confirmación
 *    explícita (`force`), con el conteo a la vista.
 *  - `CodState` no se edita (el código de negocio busca estados por código).
 *
 * `GET diagnostics` revisa todo el conjunto (ambigüedades, entidades sin/
 * con varios iniciales, reglas sin operación) por si algo se tocó fuera de
 * esta pantalla (scripts, SQL a mano).
 */
@Injectable()
export class StateMachineAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Estados ────────────────────────────────────────────────────────────

  async listStates() {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ IdeState: string; CodState: string; DesState: string; RuleCount: number }>
    >(`
      SELECT s."IdeState", s."CodState", s."DesState",
        (SELECT count(*)::int FROM ars_platform."SStateRule" r
          WHERE r."IdeStateFrom" = s."IdeState" OR r."IdeStateTo" = s."IdeState") AS "RuleCount"
      FROM ars_platform."SState" s ORDER BY s."CodState"`);
    return rows.map((r) => ({
      ideState: r.IdeState,
      codState: r.CodState,
      desState: r.DesState,
      ruleCount: r.RuleCount,
    }));
  }

  async createState(dto: CreateStateDto, actor: string) {
    const existing = await this.prisma.sState.findUnique({ where: { CodState: dto.codState } });
    if (existing) throw new ConflictException(`Ya existe el estado "${dto.codState}"`);
    const now = new Date();
    const created = await this.prisma.sState.create({
      data: {
        CodState: dto.codState,
        DesState: dto.desState.trim(),
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
    return { ideState: created.IdeState, codState: created.CodState, desState: created.DesState, ruleCount: 0 };
  }

  async updateState(ideState: string, dto: UpdateStateDto, actor: string) {
    await this.requireState(ideState);
    const updated = await this.prisma.sState.update({
      where: { IdeState: ideState },
      data: { DesState: dto.desState.trim(), UsrModification: actor, TstModification: new Date() },
    });
    return { ideState: updated.IdeState, codState: updated.CodState, desState: updated.DesState };
  }

  async deleteState(ideState: string) {
    const state = await this.requireState(ideState);
    const ruleCount = await this.prisma.sStateRule.count({
      where: { OR: [{ IdeStateFrom: ideState }, { IdeStateTo: ideState }, { IdeState: ideState }] },
    });
    if (ruleCount > 0) {
      throw new ConflictException(
        `El estado "${state.CodState}" está usado por ${ruleCount} regla(s) de transición -- quitá esas reglas primero`,
      );
    }
    const usage = await this.rowsUsingState(ideState);
    if (usage.length > 0) {
      const detail = usage.map((u) => `${u.table} (${u.count})`).join(', ');
      throw new ConflictException(
        `El estado "${state.CodState}" está en uso por filas de datos: ${detail}. No se puede borrar`,
      );
    }
    try {
      await this.prisma.sState.delete({ where: { IdeState: ideState } });
    } catch {
      // FK de alguna tabla que no tiene la columna `IdeState` estándar.
      throw new ConflictException(`El estado "${state.CodState}" está referenciado por otra tabla -- no se puede borrar`);
    }
    return { deleted: true };
  }

  // ── Entidades ──────────────────────────────────────────────────────────

  async listEntities() {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ IdeEntity: string; CodEntity: string; DesEntity: string; RuleCount: number; InitialCount: number }>
    >(`
      SELECT e."IdeEntity", e."CodEntity", e."DesEntity",
        (SELECT count(*)::int FROM ars_platform."SStateRule" r WHERE r."IdeEntity" = e."IdeEntity") AS "RuleCount",
        (SELECT count(*)::int FROM ars_platform."SStateRule" r
          WHERE r."IdeEntity" = e."IdeEntity" AND r."IndInitialState") AS "InitialCount"
      FROM ars_platform."SEntity" e ORDER BY e."CodEntity"`);
    return rows.map((r) => ({
      ideEntity: r.IdeEntity,
      codEntity: r.CodEntity,
      desEntity: r.DesEntity,
      ruleCount: r.RuleCount,
      hasInitialRule: r.InitialCount > 0,
    }));
  }

  async createEntity(dto: CreateEntityDto, actor: string) {
    const existing = await this.prisma.sEntity.findUnique({ where: { CodEntity: dto.codEntity } });
    if (existing) throw new ConflictException(`Ya existe la entidad "${dto.codEntity}"`);
    const active = await this.prisma.sState.findUnique({ where: { CodState: 'ACTIVO' } });
    if (!active) throw new BadRequestException('No existe el estado "ACTIVO" -- necesario para crear la entidad');
    const now = new Date();
    const created = await this.prisma.sEntity.create({
      data: {
        CodEntity: dto.codEntity,
        DesEntity: dto.desEntity.trim(),
        IdeState: active.IdeState,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
    return {
      ideEntity: created.IdeEntity,
      codEntity: created.CodEntity,
      desEntity: created.DesEntity,
      ruleCount: 0,
      hasInitialRule: false,
    };
  }

  async updateEntity(ideEntity: string, dto: UpdateEntityDto, actor: string) {
    await this.requireEntity(ideEntity);
    const updated = await this.prisma.sEntity.update({
      where: { IdeEntity: ideEntity },
      data: { DesEntity: dto.desEntity.trim(), UsrModification: actor, TstModification: new Date() },
    });
    return { ideEntity: updated.IdeEntity, codEntity: updated.CodEntity, desEntity: updated.DesEntity };
  }

  async deleteEntity(ideEntity: string) {
    const entity = await this.requireEntity(ideEntity);
    const ruleCount = await this.prisma.sStateRule.count({ where: { IdeEntity: ideEntity } });
    if (ruleCount > 0) {
      throw new ConflictException(
        `La entidad "${entity.CodEntity}" tiene ${ruleCount} regla(s) de transición -- quitalas primero`,
      );
    }
    try {
      await this.prisma.sEntity.delete({ where: { IdeEntity: ideEntity } });
    } catch {
      throw new ConflictException(
        `La entidad "${entity.CodEntity}" está referenciada por otras tablas (fórmulas, atributos) -- no se puede borrar`,
      );
    }
    return { deleted: true };
  }

  // ── Reglas ─────────────────────────────────────────────────────────────

  async listRules(ideEntity: string) {
    const entity = await this.requireEntity(ideEntity);
    const rules = await this.prisma.sStateRule.findMany({
      where: { IdeEntity: ideEntity },
      include: {
        SState_SStateRule_IdeStateFromToSState: true,
        SState_SStateRule_IdeStateToToSState: true,
      },
    });
    const tableOk = await this.entityTableHasState(entity.CodEntity);
    const counts = new Map<string, number>();
    if (tableOk) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ IdeState: string; n: number }>>(
        `SELECT "IdeState", count(*)::int AS n FROM ars_platform."${entity.CodEntity}" GROUP BY "IdeState"`,
      );
      for (const r of rows) counts.set(r.IdeState, r.n);
    }
    const items = rules.map((r) => ({
      ideStateRule: r.IdeStateRule,
      ideStateFrom: r.IdeStateFrom,
      codStateFrom: r.SState_SStateRule_IdeStateFromToSState.CodState,
      desStateFrom: r.SState_SStateRule_IdeStateFromToSState.DesState,
      ideStateTo: r.IdeStateTo,
      codStateTo: r.SState_SStateRule_IdeStateToToSState.CodState,
      desStateTo: r.SState_SStateRule_IdeStateToToSState.DesState,
      desOperativeCode: r.DesOperativeCode,
      indInitialState: r.IndInitialState,
      rowsInFromState: tableOk ? (counts.get(r.IdeStateFrom) ?? 0) : null,
    }));
    items.sort(
      (a, b) =>
        Number(b.indInitialState) - Number(a.indInitialState) ||
        a.codStateFrom.localeCompare(b.codStateFrom) ||
        (a.desOperativeCode ?? '').localeCompare(b.desOperativeCode ?? ''),
    );
    return {
      entity: { ideEntity: entity.IdeEntity, codEntity: entity.CodEntity, desEntity: entity.DesEntity },
      /** `false` = no hay una tabla `ars_platform."<CodEntity>"` con columna `IdeState`
       *  (conteos de filas no disponibles). */
      hasTable: tableOk,
      rules: items,
    };
  }

  async createRule(dto: CreateRuleDto, actor: string) {
    await this.requireEntity(dto.ideEntity);
    await this.requireState(dto.ideStateFrom);
    await this.requireState(dto.ideStateTo);
    const op = this.normalizeOperation(dto.desOperativeCode, dto.indInitialState);
    await this.assertRuleIsConsistent(dto.ideEntity, dto.ideStateFrom, dto.ideStateTo, op, dto.indInitialState);

    const active = await this.prisma.sState.findUnique({ where: { CodState: 'ACTIVO' } });
    if (!active) throw new BadRequestException('No existe el estado "ACTIVO" -- necesario para crear la regla');
    const now = new Date();
    const created = await this.prisma.sStateRule.create({
      data: {
        IdeEntity: dto.ideEntity,
        IdeStateFrom: dto.ideStateFrom,
        IdeStateTo: dto.ideStateTo,
        DesOperativeCode: op,
        IndInitialState: dto.indInitialState,
        IdeState: active.IdeState,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
    return { ideStateRule: created.IdeStateRule };
  }

  async updateRule(ideStateRule: string, dto: UpdateRuleDto, actor: string) {
    const rule = await this.requireRule(ideStateRule);
    await this.requireState(dto.ideStateFrom);
    await this.requireState(dto.ideStateTo);
    const op = this.normalizeOperation(dto.desOperativeCode, dto.indInitialState);
    await this.assertRuleIsConsistent(
      rule.IdeEntity,
      dto.ideStateFrom,
      dto.ideStateTo,
      op,
      dto.indInitialState,
      ideStateRule,
    );
    await this.prisma.sStateRule.update({
      where: { IdeStateRule: ideStateRule },
      data: {
        IdeStateFrom: dto.ideStateFrom,
        IdeStateTo: dto.ideStateTo,
        DesOperativeCode: op,
        IndInitialState: dto.indInitialState,
        UsrModification: actor,
        TstModification: new Date(),
      },
    });
    return { ideStateRule };
  }

  /**
   * Borra una regla. Bloquea (409) si es la regla inicial y la entidad tiene
   * otras reglas (sin inicial, `getInitialState` falla al crear registros).
   * Si hay filas de datos hoy en el estado de origen (esas filas perderían
   * esa salida), exige `force` -- la pantalla muestra el conteo antes.
   */
  async deleteRule(ideStateRule: string, force: boolean) {
    const rule = await this.requireRule(ideStateRule);
    const entity = await this.requireEntity(rule.IdeEntity);
    if (rule.IndInitialState) {
      const others = await this.prisma.sStateRule.count({
        where: { IdeEntity: rule.IdeEntity, IdeStateRule: { not: ideStateRule } },
      });
      if (others > 0) {
        throw new ConflictException(
          `Es la regla INICIAL de "${entity.CodEntity}" -- marcá otra regla como inicial antes de borrar esta (sin regla inicial no se pueden crear registros nuevos)`,
        );
      }
    }
    const rowsInFromState = await this.countRowsInState(entity.CodEntity, rule.IdeStateFrom);
    if (rowsInFromState > 0 && !force) {
      throw new RowsInStateConflict(
        `Hay ${rowsInFromState} fila(s) de "${entity.CodEntity}" en el estado de origen de esta regla: perderían esta transición`,
        rowsInFromState,
      );
    }
    await this.prisma.sStateRule.delete({ where: { IdeStateRule: ideStateRule } });
    return { deleted: true };
  }

  // ── Diagnóstico ────────────────────────────────────────────────────────

  async diagnostics() {
    const [entities, states, rules] = await Promise.all([
      this.prisma.sEntity.findMany(),
      this.prisma.sState.findMany(),
      this.prisma.sStateRule.findMany(),
    ]);
    const entityCod = new Map(entities.map((e) => [e.IdeEntity, e.CodEntity]));
    const stateCod = new Map(states.map((s) => [s.IdeState, s.CodState]));
    const problems: Array<{ severity: 'error' | 'warning'; kind: string; codEntity: string; message: string }> = [];

    const groups = new Map<string, typeof rules>();
    for (const r of rules) {
      const op = (r.DesOperativeCode ?? '').trim();
      if (NO_OPERATION.has(op)) continue;
      const key = `${r.IdeEntity}|${r.IdeStateFrom}|${op}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const group of groups.values()) {
      const destinations = new Set(group.map((r) => r.IdeStateTo));
      if (destinations.size > 1) {
        const r = group[0];
        problems.push({
          severity: 'error',
          kind: 'AMBIGUOUS',
          codEntity: entityCod.get(r.IdeEntity) ?? r.IdeEntity,
          message: `${stateCod.get(r.IdeStateFrom)} -[${r.DesOperativeCode}]-> tiene ${destinations.size} destinos distintos (${[...destinations].map((d) => stateCod.get(d)).join(', ')}); el sistema elegiría uno al azar`,
        });
      }
    }

    const byEntity = new Map<string, typeof rules>();
    for (const r of rules) {
      if (!byEntity.has(r.IdeEntity)) byEntity.set(r.IdeEntity, []);
      byEntity.get(r.IdeEntity)!.push(r);
    }
    for (const [ideEntity, list] of byEntity) {
      const codEntity = entityCod.get(ideEntity) ?? ideEntity;
      const initials = list.filter((r) => r.IndInitialState).length;
      if (initials === 0) {
        problems.push({
          severity: 'error',
          kind: 'NO_INITIAL',
          codEntity,
          message: 'Tiene reglas pero ninguna marcada como inicial: no se pueden crear registros nuevos',
        });
      } else if (initials > 1) {
        problems.push({
          severity: 'error',
          kind: 'MULTIPLE_INITIAL',
          codEntity,
          message: `Tiene ${initials} reglas marcadas como iniciales; el sistema toma una al azar`,
        });
      }
      for (const r of list) {
        const op = (r.DesOperativeCode ?? '').trim();
        if (!r.IndInitialState && NO_OPERATION.has(op)) {
          problems.push({
            severity: 'warning',
            kind: 'NO_OPERATION',
            codEntity,
            message: `${stateCod.get(r.IdeStateFrom)} -> ${stateCod.get(r.IdeStateTo)} no es inicial y no tiene operación: nunca se puede ejecutar`,
          });
        }
      }
    }
    const withoutRules = entities.filter((e) => !byEntity.has(e.IdeEntity));
    return {
      entitiesChecked: entities.length,
      rulesChecked: rules.length,
      entitiesWithoutRules: withoutRules.length,
      problems,
    };
  }

  // ── Internos ───────────────────────────────────────────────────────────

  /** La regla inicial puede no tener operación (se guarda `-`, como el
   *  legado); cualquier otra la exige. */
  private normalizeOperation(op: string | undefined, indInitialState: boolean): string {
    const trimmed = (op ?? '').trim();
    if (NO_OPERATION.has(trimmed)) {
      if (!indInitialState) {
        throw new BadRequestException('Una regla que no es la inicial necesita un código de operación');
      }
      return '-';
    }
    return trimmed;
  }

  private async assertRuleIsConsistent(
    ideEntity: string,
    ideStateFrom: string,
    ideStateTo: string,
    op: string,
    indInitialState: boolean,
    excludeRule?: string,
  ): Promise<void> {
    const others = await this.prisma.sStateRule.findMany({
      where: { IdeEntity: ideEntity, ...(excludeRule ? { IdeStateRule: { not: excludeRule } } : {}) },
    });
    const states = await this.prisma.sState.findMany({
      where: { IdeState: { in: [...new Set([ideStateFrom, ideStateTo, ...others.map((o) => o.IdeStateTo)])] } },
    });
    const cod = new Map(states.map((s) => [s.IdeState, s.CodState]));

    const duplicate = others.find(
      (o) => o.IdeStateFrom === ideStateFrom && o.IdeStateTo === ideStateTo && (o.DesOperativeCode ?? '') === op,
    );
    if (duplicate) {
      throw new ConflictException('Ya existe una regla idéntica (misma entidad, origen, destino y operación)');
    }

    if (!NO_OPERATION.has(op)) {
      const ambiguous = others.find(
        (o) =>
          o.IdeStateFrom === ideStateFrom &&
          (o.DesOperativeCode ?? '').trim() === op &&
          o.IdeStateTo !== ideStateTo,
      );
      if (ambiguous) {
        throw new ConflictException(
          `Ya existe una regla para esa entidad con el mismo origen y la operación "${op}" que va a "${cod.get(ambiguous.IdeStateTo)}": dos destinos para la misma transición son ambiguos. Editá o borrá la existente`,
        );
      }
    }

    if (indInitialState && others.some((o) => o.IndInitialState)) {
      throw new ConflictException(
        'La entidad ya tiene una regla inicial -- desmarcala primero (una entidad solo puede tener una)',
      );
    }
  }

  private async requireState(ideState: string) {
    const state = await this.prisma.sState.findUnique({ where: { IdeState: ideState } });
    if (!state) throw new NotFoundException(`No existe el estado "${ideState}"`);
    return state;
  }

  private async requireEntity(ideEntity: string) {
    const entity = await this.prisma.sEntity.findUnique({ where: { IdeEntity: ideEntity } });
    if (!entity) throw new NotFoundException(`No existe la entidad "${ideEntity}"`);
    return entity;
  }

  private async requireRule(ideStateRule: string) {
    const rule = await this.prisma.sStateRule.findUnique({ where: { IdeStateRule: ideStateRule } });
    if (!rule) throw new NotFoundException(`No existe la regla "${ideStateRule}"`);
    return rule;
  }

  /** Tablas de `ars_platform` con columna `IdeState` (excepto `SState`, donde
   *  `IdeState` es la PK del propio estado). */
  private async tablesWithState(): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'ars_platform' AND c.column_name = 'IdeState' AND c.table_name <> 'SState'
      ORDER BY c.table_name`);
    return rows.map((r) => r.table_name);
  }

  private async entityTableHasState(codEntity: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_]+$/.test(codEntity)) return false;
    return (await this.tablesWithState()).includes(codEntity);
  }

  private async countRowsInState(codEntity: string, ideState: string): Promise<number> {
    if (!(await this.entityTableHasState(codEntity))) return 0;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM ars_platform."${codEntity}" WHERE "IdeState" = $1::uuid`,
      ideState,
    );
    return rows[0]?.n ?? 0;
  }

  private async rowsUsingState(ideState: string): Promise<Array<{ table: string; count: number }>> {
    const tables = await this.tablesWithState();
    if (tables.length === 0) return [];
    // Los nombres salen de information_schema (no de input del usuario).
    const sql = tables
      .map((t) => `SELECT '${t}' AS t, count(*)::int AS n FROM ars_platform."${t}" WHERE "IdeState" = $1::uuid`)
      .join(' UNION ALL ');
    const rows = await this.prisma.$queryRawUnsafe<Array<{ t: string; n: number }>>(sql, ideState);
    return rows.filter((r) => r.n > 0).map((r) => ({ table: r.t, count: r.n }));
  }
}
