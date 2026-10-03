#!/usr/bin/env node
/**
 * Normaliza la máquina de estados de `ars_platform` al modelo del sistema
 * LEGADO (esquemas `entity`/`temporal`: solo 10 estados, ninguno `SEED_*`)
 * -- decisión del usuario (2026-10-03), tras correr
 * `investigate-state-machine-legacy.js`. Qué hace, todo en UNA transacción:
 *
 *  1. DATOS: toda fila (cualquier tabla de `ars_platform` con columna
 *     `IdeState`) en `SEED_ANULADO`/`SEED_MODIFICADO`/`SEED_BORRADOR`/
 *     `SEED_CONTRATADO` pasa a `ANULADO`/`MODIFICADO`/`BORRADOR`/
 *     `CONTRATADO`.
 *  2. HIJAS DE COTIZACIÓN (`TQuoteRisk`, `TQuoteRiskPlan`, `TQuoteCoverage`,
 *     `TQuoteCoverageConcept`): su estado se alinea con el de su
 *     `TQuote` (como hace la cascada: BORRADOR -> ACEPTADO -> CONTRATADO).
 *     Hoy muchas quedaron en `ACTIVO` por reglas de seed que el legado no
 *     tiene.
 *  3. REGLAS (`SStateRule`): se re-apuntan los `SEED_*` a su estado real;
 *     se borran reglas idénticas repetidas; las hijas de cotización pasan
 *     a `BORRADOR -[Aceptar]-> ACEPTADO` y se elimina la regla de seed
 *     `ACTIVO -[Contratar]-> ACTIVO`; y donde quedan dos reglas con el
 *     mismo (entidad, origen, operación) pero destinos distintos
 *     (ej. `TCoverageMovement ACTIVO -[Anular]->` `ACTIVO` vs `ANULADO`),
 *     gana la que antes apuntaba a un `SEED_*` (= `ANULADO`/`MODIFICADO`
 *     visible, decisión del usuario; el legado dejaba el movimiento en
 *     ACTIVO).
 *  4. Se borran los 4 `SState` `SEED_*` solo si ya nada los referencia.
 *
 * Seguridad: por defecto es DRY-RUN -- ejecuta todo dentro de la
 * transacción, imprime el detalle y hace ROLLBACK. Con `--apply` confirma,
 * y antes escribe `normalize-state-machine.backup.json` (reglas y estados
 * previos de cada fila tocada) para poder revertir. No toca `SState`
 * reales ni los esquemas del legado. Aborta (rollback) si tras los pasos
 * algo todavía referencia un `SEED_*`, o si una hija de cotización sigue
 * en `ACTIVO` pero se iba a borrar su regla.
 *
 * Uso (desde la raíz del repo):
 *   node packages/database/scripts/normalize-state-machine.js          # dry-run
 *   node packages/database/scripts/normalize-state-machine.js --apply  # aplica
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(__dirname, '..', '..', '..', 'services', 'underwriting-service', '.env'));

const APPLY = process.argv.includes('--apply');
const BACKUP_FILE = path.join(__dirname, 'normalize-state-machine.backup.json');
const prisma = new PrismaClient();

const SEED_TO_REAL = {
  SEED_ANULADO: 'ANULADO',
  SEED_MODIFICADO: 'MODIFICADO',
  SEED_BORRADOR: 'BORRADOR',
  SEED_CONTRATADO: 'CONTRATADO',
};
const QUOTE_CHILDREN = [
  { table: 'TQuoteRisk', pk: 'IdeQuoteRisk', quoteJoin: `JOIN ars_platform."TQuote" q ON q."IdeQuote" = c."IdeQuote"` },
  {
    table: 'TQuoteRiskPlan',
    pk: 'IdeQuoteRiskPlan',
    quoteJoin: `JOIN ars_platform."TQuoteRisk" r ON r."IdeQuoteRisk" = c."IdeQuoteRisk"
                JOIN ars_platform."TQuote" q ON q."IdeQuote" = r."IdeQuote"`,
  },
  {
    table: 'TQuoteCoverage',
    pk: 'IdeQuoteCoverage',
    quoteJoin: `JOIN ars_platform."TQuoteRiskPlan" p ON p."IdeQuoteRiskPlan" = c."IdeQuoteRiskPlan"
                JOIN ars_platform."TQuoteRisk" r ON r."IdeQuoteRisk" = p."IdeQuoteRisk"
                JOIN ars_platform."TQuote" q ON q."IdeQuote" = r."IdeQuote"`,
  },
  {
    table: 'TQuoteCoverageConcept',
    pk: 'IdeQuoteCoverageConcept',
    quoteJoin: `JOIN ars_platform."TQuoteCoverage" cv ON cv."IdeQuoteCoverage" = c."IdeQuoteCoverage"
                JOIN ars_platform."TQuoteRiskPlan" p ON p."IdeQuoteRiskPlan" = cv."IdeQuoteRiskPlan"
                JOIN ars_platform."TQuoteRisk" r ON r."IdeQuoteRisk" = p."IdeQuoteRisk"
                JOIN ars_platform."TQuote" q ON q."IdeQuote" = r."IdeQuote"`,
  },
];

class DryRunRollback extends Error {}
const backup = { statesDeleted: [], rulesBefore: [], rowStateChanges: [] };

function log(t = '') {
  console.log(t);
}

async function main() {
  log(APPLY ? '*** MODO --apply: se CONFIRMAN los cambios ***\n' : '*** DRY-RUN: se simula todo y se hace rollback (usá --apply para confirmar) ***\n');
  try {
    await prisma.$transaction(
      async (tx) => {
        await run(tx);
        if (!APPLY) throw new DryRunRollback();
        fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
        log(`\nRespaldo escrito en ${path.basename(BACKUP_FILE)} (no se versiona).`);
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
    log(APPLY ? '\nOK: cambios confirmados.' : '');
  } catch (err) {
    if (err instanceof DryRunRollback) {
      log('\nDRY-RUN terminado: se hizo ROLLBACK, la base no cambió. Si el detalle es correcto, corré con --apply.');
    } else {
      throw err;
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function run(tx) {
  const states = await tx.$queryRawUnsafe(`SELECT "IdeState", "CodState" FROM ars_platform."SState"`);
  const idByCode = new Map(states.map((s) => [s.CodState, s.IdeState]));
  const codById = new Map(states.map((s) => [s.IdeState, s.CodState]));
  for (const [seed, real] of Object.entries(SEED_TO_REAL)) {
    if (!idByCode.has(real)) throw new Error(`Falta el estado real ${real}`);
  }
  for (const code of ['ACEPTADO', 'CONTRATADO', 'ACTIVO', 'BORRADOR']) {
    if (!idByCode.has(code)) throw new Error(`Falta el estado ${code}`);
  }
  const seedIds = Object.keys(SEED_TO_REAL).filter((c) => idByCode.has(c));
  if (seedIds.length === 0) log('No quedan estados SEED_* en SState (¿ya se normalizó?). Se sigue con el resto de los pasos.');

  // ── 1. Datos: SEED_* -> real, en toda tabla con IdeState ────────────────
  log('== 1. Filas en estados SEED_* ==');
  const stateTables = await tx.$queryRawUnsafe(`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'ars_platform' AND c.column_name = 'IdeState'
      AND c.table_name <> 'SState' -- ahí "IdeState" es la PK del propio estado, no una referencia
    ORDER BY c.table_name`);
  for (const { table_name: table } of stateTables) {
    const pk = await primaryKey(tx, table);
    for (const seed of seedIds) {
      const real = SEED_TO_REAL[seed];
      const rows = await tx.$queryRawUnsafe(
        `SELECT "${pk}" AS pk FROM ars_platform."${table}" WHERE "IdeState" = $1::uuid`,
        idByCode.get(seed),
      );
      if (rows.length === 0) continue;
      backup.rowStateChanges.push({ table, pk, oldState: seed, rows: rows.map((r) => r.pk) });
      await tx.$executeRawUnsafe(
        `UPDATE ars_platform."${table}" SET "IdeState" = $1::uuid WHERE "IdeState" = $2::uuid`,
        idByCode.get(real),
        idByCode.get(seed),
      );
      log(`  ${table}: ${rows.length} fila(s) ${seed} -> ${real}`);
    }
  }

  // ── 2. Hijas de cotización: alinear con su TQuote ───────────────────────
  log('\n== 2. Hijas de cotización: alinear con el estado de su TQuote ==');
  for (const child of QUOTE_CHILDREN) {
    const rows = await tx.$queryRawUnsafe(`
      SELECT c."${child.pk}" AS pk, c."IdeState" AS old_state, q."IdeState" AS new_state
      FROM ars_platform."${child.table}" c ${child.quoteJoin}
      WHERE c."IdeState" <> q."IdeState"`);
    if (rows.length === 0) {
      log(`  ${child.table}: ya alineada`);
      continue;
    }
    const summary = new Map();
    for (const r of rows) {
      const key = `${codById.get(r.old_state)} -> ${codById.get(r.new_state)}`;
      summary.set(key, (summary.get(key) ?? 0) + 1);
    }
    backup.rowStateChanges.push({
      table: child.table,
      pk: child.pk,
      note: 'alineación con TQuote',
      rowsWithOldState: rows.map((r) => ({ pk: r.pk, oldState: r.old_state })),
    });
    for (const r of rows) {
      await tx.$executeRawUnsafe(
        `UPDATE ars_platform."${child.table}" SET "IdeState" = $1::uuid WHERE "${child.pk}" = $2::uuid`,
        r.new_state,
        r.pk,
      );
    }
    log(`  ${child.table}: ${[...summary].map(([k, n]) => `${n} (${k})`).join(', ')}`);
  }

  // ── 3. Reglas ──────────────────────────────────────────────────────────
  log('\n== 3. Reglas de transición (SStateRule) ==');
  backup.rulesBefore = await tx.$queryRawUnsafe(`SELECT * FROM ars_platform."SStateRule"`);
  const entities = await tx.$queryRawUnsafe(`SELECT "IdeEntity", "CodEntity" FROM ars_platform."SEntity"`);
  const entityCod = new Map(entities.map((e) => [e.IdeEntity, e.CodEntity]));
  const describe = (r) =>
    `${entityCod.get(r.IdeEntity)}: ${codById.get(r.IdeStateFrom)} -[${r.DesOperativeCode ?? ''}]-> ${codById.get(r.IdeStateTo)}`;

  // 3a. marcar reglas que apuntaban a SEED_* (ganan los conflictos)
  const preferred = new Set(
    (
      await tx.$queryRawUnsafe(
        `SELECT "IdeStateRule" FROM ars_platform."SStateRule" WHERE "IdeStateTo" = ANY($1::uuid[])`,
        seedIds.map((c) => idByCode.get(c)),
      )
    ).map((r) => r.IdeStateRule),
  );

  // 3b. re-apuntar origen/destino. Hay una restricción UNIQUE
  // (entidad, origen, destino, operación): si al re-apuntar una regla
  // SEED_* queda IDÉNTICA a otra que ya existe, se elimina la SEED y
  // sobrevive la otra (que hereda la marca "preferida" para el paso 3e).
  const realOf = (id) => {
    const cod = codById.get(id);
    return SEED_TO_REAL[cod] ? idByCode.get(SEED_TO_REAL[cod]) : id;
  };
  const keyOf = (r, from, to) => `${r.IdeEntity}|${from}|${to}|${r.DesOperativeCode ?? ''}`;
  const allRules = await tx.$queryRawUnsafe(`SELECT * FROM ars_platform."SStateRule"`);
  const survivors = new Map(); // clave final -> id de la regla que la ocupa
  const changing = [];
  for (const r of allRules) {
    const from = realOf(r.IdeStateFrom);
    const to = realOf(r.IdeStateTo);
    if (from === r.IdeStateFrom && to === r.IdeStateTo) survivors.set(keyOf(r, from, to), r.IdeStateRule);
    else changing.push({ r, from, to });
  }
  let repointed = 0;
  let mergedIntoExisting = 0;
  for (const { r, from, to } of changing) {
    const key = keyOf(r, from, to);
    const survivor = survivors.get(key);
    if (survivor) {
      await tx.$executeRawUnsafe(`DELETE FROM ars_platform."SStateRule" WHERE "IdeStateRule" = $1::uuid`, r.IdeStateRule);
      if (preferred.has(r.IdeStateRule)) preferred.add(survivor);
      mergedIntoExisting++;
      log(`  regla SEED eliminada por existir ya su equivalente real -- ${describe(r)}  (=> ${codById.get(to)})`);
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE ars_platform."SStateRule" SET "IdeStateFrom" = $1::uuid, "IdeStateTo" = $2::uuid WHERE "IdeStateRule" = $3::uuid`,
        from,
        to,
        r.IdeStateRule,
      );
      survivors.set(key, r.IdeStateRule);
      repointed++;
    }
  }
  log(`  ${repointed} regla(s) re-apuntada(s) a estados reales, ${mergedIntoExisting} fundida(s) con una equivalente`);

  // 3c. hijas de cotización: Aceptar -> ACEPTADO; fuera ACTIVO -[Contratar]-> ACTIVO
  const childEntities = QUOTE_CHILDREN.map((c) => c.table);
  const childEntityIds = entities.filter((e) => childEntities.includes(e.CodEntity)).map((e) => e.IdeEntity);
  const stillActive = [];
  for (const child of QUOTE_CHILDREN) {
    const n = await tx.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM ars_platform."${child.table}" WHERE "IdeState" = $1::uuid`,
      idByCode.get('ACTIVO'),
    );
    if (n[0].n > 0) stillActive.push(`${child.table} (${n[0].n})`);
  }
  if (stillActive.length > 0) {
    throw new Error(`Hijas de cotización todavía en ACTIVO tras alinear: ${stillActive.join(', ')} -- se aborta`);
  }
  const acceptFix = await tx.$queryRawUnsafe(
    `UPDATE ars_platform."SStateRule" r SET "IdeStateTo" = $1::uuid
      WHERE r."IdeEntity" = ANY($2::uuid[]) AND r."IdeStateFrom" = $3::uuid AND r."DesOperativeCode" = 'Aceptar'
        AND r."IdeStateTo" = $4::uuid
        AND NOT EXISTS (SELECT 1 FROM ars_platform."SStateRule" x WHERE x."IdeEntity" = r."IdeEntity"
          AND x."IdeStateFrom" = r."IdeStateFrom" AND x."IdeStateTo" = $1::uuid AND x."DesOperativeCode" = 'Aceptar')
      RETURNING r."IdeEntity"`,
    idByCode.get('ACEPTADO'),
    childEntityIds,
    idByCode.get('BORRADOR'),
    idByCode.get('ACTIVO'),
  );
  log(`  Hijas de cotización: ${acceptFix.length} regla(s) BORRADOR -[Aceptar]-> ACTIVO ahora van a ACEPTADO`);
  const contratarDel = await tx.$queryRawUnsafe(
    `DELETE FROM ars_platform."SStateRule"
      WHERE "IdeEntity" = ANY($1::uuid[]) AND "IdeStateFrom" = $2::uuid AND "DesOperativeCode" = 'Contratar'
        AND "IdeStateTo" = $2::uuid RETURNING "IdeEntity"`,
    childEntityIds,
    idByCode.get('ACTIVO'),
  );
  log(`  Hijas de cotización: ${contratarDel.length} regla(s) ACTIVO -[Contratar]-> ACTIVO eliminadas`);

  // 3d. borrar duplicados exactos (se queda una, preferentemente la inicial)
  const dupDeleted = await tx.$queryRawUnsafe(`
    DELETE FROM ars_platform."SStateRule" r USING (
      SELECT "IdeStateRule", row_number() OVER (
        PARTITION BY "IdeEntity", "IdeStateFrom", COALESCE("DesOperativeCode", ''), "IdeStateTo"
        ORDER BY "IndInitialState" DESC, "IdeStateRule") AS rn
      FROM ars_platform."SStateRule") d
    WHERE r."IdeStateRule" = d."IdeStateRule" AND d.rn > 1
    RETURNING r."IdeEntity", r."IdeStateFrom", r."IdeStateTo", r."DesOperativeCode"`);
  for (const r of dupDeleted) log(`  duplicada eliminada -- ${describe(r)}`);
  if (dupDeleted.length === 0) log('  (sin reglas idénticas repetidas)');

  // 3e. conflictos: mismo (entidad, origen, operación) con destinos distintos
  const rules = await tx.$queryRawUnsafe(`SELECT * FROM ars_platform."SStateRule"`);
  const groups = new Map();
  for (const r of rules) {
    const op = r.DesOperativeCode ?? '';
    if (op === '' || op === '-') continue; // reglas iniciales sin operación
    const key = `${r.IdeEntity}|${r.IdeStateFrom}|${op}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  let unresolved = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const winners = group.filter((r) => preferred.has(r.IdeStateRule));
    if (winners.length === 1) {
      for (const loser of group.filter((r) => r !== winners[0])) {
        await tx.$executeRawUnsafe(`DELETE FROM ars_platform."SStateRule" WHERE "IdeStateRule" = $1::uuid`, loser.IdeStateRule);
        log(`  conflicto resuelto -- se elimina ${describe(loser)} (gana -> ${codById.get(winners[0].IdeStateTo)})`);
      }
    } else {
      unresolved++;
      log(`  !! conflicto SIN resolver: ${group.map(describe).join('  |  ')}`);
    }
  }

  // ── 4. Borrar estados SEED_* si nada los referencia ─────────────────────
  log('\n== 4. Estados SEED_* ==');
  const refs = [];
  for (const { table_name: table } of stateTables) {
    for (const seed of seedIds) {
      const n = await tx.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM ars_platform."${table}" WHERE "IdeState" = $1::uuid`,
        idByCode.get(seed),
      );
      if (n[0].n > 0) refs.push(`${table}.IdeState=${seed} (${n[0].n})`);
    }
  }
  for (const seed of seedIds) {
    const n = await tx.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM ars_platform."SStateRule" WHERE "IdeStateFrom" = $1::uuid OR "IdeStateTo" = $1::uuid`,
      idByCode.get(seed),
    );
    if (n[0].n > 0) refs.push(`SStateRule ${seed} (${n[0].n})`);
  }
  if (refs.length > 0) throw new Error(`Todavía hay referencias a SEED_*: ${refs.join(', ')} -- se aborta`);
  for (const seed of seedIds) {
    const row = states.find((s) => s.CodState === seed);
    const full = await tx.$queryRawUnsafe(`SELECT * FROM ars_platform."SState" WHERE "IdeState" = $1::uuid`, row.IdeState);
    backup.statesDeleted.push(full[0]);
    try {
      await tx.$executeRawUnsafe(`DELETE FROM ars_platform."SState" WHERE "IdeState" = $1::uuid`, row.IdeState);
      log(`  ${seed}: eliminado de SState`);
    } catch (err) {
      throw new Error(`No se pudo borrar ${seed} (¿otra tabla lo referencia por FK?): ${err.message}`);
    }
  }

  log(`\nResumen: ${unresolved} conflicto(s) sin resolver${unresolved ? ' -- revisar a mano' : ''}.`);
}

async function primaryKey(tx, table) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT a.attname AS col FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = ('ars_platform."' || $1 || '"')::regclass AND i.indisprimary`,
    table,
  );
  if (rows.length !== 1) throw new Error(`La tabla ${table} no tiene PK simple (${rows.length} columnas)`);
  return rows[0].col;
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
