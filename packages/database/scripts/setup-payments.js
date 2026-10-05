#!/usr/bin/env node
/**
 * Cobranza de recibos -- Etapa 1 (roadmap, "Cobranza y activación con pago").
 *
 * 1) Crea (si no existe) `ars_platform."TPayment"`: UN registro por cobro
 *    (o intento de cobro) de un recibo.
 *      - `CodMethod`: PASARELA (pago online) | MANUAL (el operador activó el
 *        contrato sin pasar por pasarela y marcó el recibo como cobrado).
 *      - `CodProvider`: pasarela usada (stripe, sandbox...), solo PASARELA.
 *      - `CodStatus`: PENDIENTE -> COBRADO | FALLIDO | CANCELADO.
 *      - `DesExternalId`: id de la sesión/pago en la pasarela (único por
 *        proveedor: evita registrar dos veces el mismo webhook).
 *      - `DesReason`: motivo escrito por el operador en un cobro MANUAL.
 *      - `DesPayload` (jsonb): datos crudos/normalizados de la pasarela.
 *    El importe/moneda se guardan en el cobro (no solo en el recibo) porque
 *    es lo que se cobró realmente.
 *
 * 2) Máquina de estados: agrega el estado `COBRADO` (si falta) y la
 *    transición de `TReceipt`: estado inicial -> COBRADO vía `'Cobrar'`.
 *    Hasta ahora `TReceipt` estaba "sin transición" (ver
 *    `seed-contract-testing-fixtures.js`, `NO_TRANSITION_ENTITIES`).
 *
 * Idempotente. Después de correrlo:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 * (el código accede a TPayment con SQL crudo, así que compila igual antes de eso).
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/setup-payments.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

const SYSTEM = 'setup-payments';

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');

    // --- 1. Tabla de cobros ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS ars_platform."TPayment" (
        "IdePayment" uuid NOT NULL DEFAULT gen_random_uuid(),
        "IdeReceipt" uuid NOT NULL,
        "IdeContract" uuid NOT NULL,
        "Amount" numeric NOT NULL,
        "CodCurrency" varchar(30) NOT NULL,
        "CodMethod" varchar(20) NOT NULL,
        "CodProvider" varchar(30),
        "CodStatus" varchar(20) NOT NULL DEFAULT 'PENDIENTE',
        "DesExternalId" varchar,
        "DesReason" varchar,
        "DesPayload" jsonb,
        "TstPaid" timestamp(6),
        "UsrCreation" varchar(60) NOT NULL,
        "TstCreation" timestamp(6) NOT NULL,
        "UsrModification" varchar(60) NOT NULL,
        "TstModification" timestamp(6) NOT NULL,
        CONSTRAINT "PK_TPayment" PRIMARY KEY ("IdePayment"),
        CONSTRAINT "FK_TPayment_TReceipt" FOREIGN KEY ("IdeReceipt") REFERENCES ars_platform."TReceipt" ("IdeReceipt"),
        CONSTRAINT "FK_TPayment_TContract" FOREIGN KEY ("IdeContract") REFERENCES ars_platform."TContract" ("IdeContract"),
        CONSTRAINT "CK_TPayment_CodMethod" CHECK ("CodMethod" IN ('PASARELA', 'MANUAL')),
        CONSTRAINT "CK_TPayment_CodStatus" CHECK ("CodStatus" IN ('PENDIENTE', 'COBRADO', 'FALLIDO', 'CANCELADO'))
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "IX_TPayment_IdeReceipt" ON ars_platform."TPayment" ("IdeReceipt")`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS "IX_TPayment_IdeContract" ON ars_platform."TPayment" ("IdeContract", "TstCreation" DESC)`,
    );
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UK_TPayment_ProviderExternal"
        ON ars_platform."TPayment" ("CodProvider", "DesExternalId")
        WHERE "DesExternalId" IS NOT NULL
    `);
    console.log('= TPayment lista');

    // --- 2. Máquina de estados: TReceipt  inicial -> COBRADO vía 'Cobrar' ---
    const now = new Date();
    const stateRes = await client.query(`SELECT "IdeState", "CodState" FROM ars_platform."SState" WHERE "CodState" IN ('COBRADO', 'ACTIVO')`);
    const byCode = Object.fromEntries(stateRes.rows.map((r) => [r.CodState, r.IdeState]));
    if (!byCode.ACTIVO) throw new Error('No existe SState "ACTIVO" en ars_platform.');
    let ideCobrado = byCode.COBRADO;
    if (!ideCobrado) {
      const created = await client.query(
        `INSERT INTO ars_platform."SState" ("CodState", "DesState", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
         VALUES ('COBRADO', 'Cobrado', $1, $2, $1, $2) RETURNING "IdeState"`,
        [SYSTEM, now],
      );
      ideCobrado = created.rows[0].IdeState;
      console.log('+ SState COBRADO creado');
    } else {
      console.log('= SState COBRADO ya existía');
    }

    const entityRes = await client.query(`SELECT "IdeEntity" FROM ars_platform."SEntity" WHERE "CodEntity" = 'TReceipt'`);
    if (!entityRes.rows.length) throw new Error('No existe SEntity "TReceipt".');
    const ideEntity = entityRes.rows[0].IdeEntity;

    const initialRes = await client.query(
      `SELECT "IdeStateTo" FROM ars_platform."SStateRule" WHERE "IdeEntity" = $1 AND "IndInitialState" = true`,
      [ideEntity],
    );
    if (!initialRes.rows.length) throw new Error('TReceipt no tiene estado inicial configurado (SStateRule.IndInitialState).');
    const ideInitial = initialRes.rows[0].IdeStateTo;

    const ruleRes = await client.query(
      `SELECT 1 FROM ars_platform."SStateRule"
        WHERE "IdeEntity" = $1 AND "IdeStateFrom" = $2 AND "IdeStateTo" = $3 AND "DesOperativeCode" = 'Cobrar'`,
      [ideEntity, ideInitial, ideCobrado],
    );
    if (ruleRes.rows.length) {
      console.log('= SStateRule ya existía (TReceipt, inicial -> COBRADO, op=Cobrar)');
    } else {
      await client.query(
        `INSERT INTO ars_platform."SStateRule"
           ("IdeEntity", "IdeStateFrom", "IdeStateTo", "IndInitialState", "DesOperativeCode", "IdeState",
            "UsrCreation", "TstCreation", "UsrModification", "TstModification")
         VALUES ($1, $2, $3, false, 'Cobrar', $4, $5, $6, $5, $6)`,
        [ideEntity, ideInitial, ideCobrado, byCode.ACTIVO, SYSTEM, now],
      );
      console.log('+ SStateRule creada (TReceipt, inicial -> COBRADO, op=Cobrar)');
    }

    await client.query('COMMIT');
    console.log('OK. Cobranza (etapa 1) lista.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
