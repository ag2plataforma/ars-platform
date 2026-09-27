#!/usr/bin/env node
/**
 * Migración de esquema para Fase 4 (Siniestros), Etapa 2 -- 2026-09-24.
 *
 * A diferencia de Etapa 1 (que solo sembró catálogos/estados sobre
 * tablas YA existentes en el esquema legado -- ver
 * `investigate-claims-engine.js`), Etapa 2 necesita DOS tablas que NO
 * existen en el esquema original:
 *
 *  - "SClaimApprovalThreshold": catálogo nuevo, acordado con el usuario,
 *    para configurar (por pantalla) los umbrales de escalamiento de
 *    aprobación de siniestros por Producto/Plan/Cobertura + Moneda,
 *    mismo patrón de comodín NULL que `SProductRequirement`.
 *  - "TClaimPayment": registro de la EJECUCIÓN del pago de una
 *    aprobación de siniestro (`TApproval` ya guarda la INTENCIÓN de
 *    pago -- IdePaymentType/IdePersonPayment/TstPayment -- pero no hay
 *    tabla que registre que el pago realmente se hizo). Se decidió NO
 *    forzar esto dentro de `TReceipt`/`TCoverageMovement` de
 *    billing-service porque esas tablas están diseñadas para COBRAR
 *    primas (Fee/Prime/Rate, ligadas a TContractOperation), no para
 *    pagar indemnizaciones -- ver discusión con el usuario, 2026-09-24.
 *
 * Idempotente: usa IF NOT EXISTS en todo lo que Postgres lo permite, y
 * verifica manualmente antes de los ADD CONSTRAINT (que no lo soportan).
 * Se puede correr varias veces sin fallar.
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/migrate-claims-etapa2-schema.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    throw new Error(`No se encontró DATABASE_URL en ${envPath}`);
  }
  return match[1].trim();
}

const STATEMENTS = [
  // --- SClaimApprovalThreshold -----------------------------------------
  `CREATE TABLE IF NOT EXISTS ars_platform."SClaimApprovalThreshold" (
    "IdeClaimApprovalThreshold" uuid NOT NULL DEFAULT gen_random_uuid(),
    "IdeProduct" uuid NOT NULL,
    "IdePlanProduct" uuid,
    "IdeCoveragePlan" uuid,
    "IdeCurrency" uuid NOT NULL,
    "Level" integer NOT NULL,
    "MaxAmount" numeric,
    "IdeRol" uuid NOT NULL,
    "IdeState" uuid NOT NULL,
    "UsrCreation" varchar(60) NOT NULL,
    "TstCreation" timestamp NOT NULL,
    "UsrModification" varchar(60) NOT NULL,
    "TstModification" timestamp NOT NULL,
    CONSTRAINT "PK_SClaimApprovalThreshold" PRIMARY KEY ("IdeClaimApprovalThreshold")
  )`,
  `ALTER TABLE ars_platform."SClaimApprovalThreshold"
    ADD CONSTRAINT "FK_SClaimApprovalThreshold_SProduct" FOREIGN KEY ("IdeProduct")
      REFERENCES ars_platform."SProduct"("IdeProduct")`,
  `ALTER TABLE ars_platform."SClaimApprovalThreshold"
    ADD CONSTRAINT "FK_SClaimApprovalThreshold_SPlanProduct" FOREIGN KEY ("IdePlanProduct")
      REFERENCES ars_platform."SPlanProduct"("IdePlanProduct")`,
  `ALTER TABLE ars_platform."SClaimApprovalThreshold"
    ADD CONSTRAINT "FK_SClaimApprovalThreshold_SCoveragePlan" FOREIGN KEY ("IdeCoveragePlan")
      REFERENCES ars_platform."SCoveragePlan"("IdeCoveragePlan")`,
  `ALTER TABLE ars_platform."SClaimApprovalThreshold"
    ADD CONSTRAINT "FK_SClaimApprovalThreshold_SCurrency" FOREIGN KEY ("IdeCurrency")
      REFERENCES ars_platform."SCurrency"("IdeCurrency")`,
  `ALTER TABLE ars_platform."SClaimApprovalThreshold"
    ADD CONSTRAINT "FK_SClaimApprovalThreshold_TRol" FOREIGN KEY ("IdeRol")
      REFERENCES ars_platform."TRol"("IdeRol")`,
  `ALTER TABLE ars_platform."SClaimApprovalThreshold"
    ADD CONSTRAINT "FK_SClaimApprovalThreshold_SState" FOREIGN KEY ("IdeState")
      REFERENCES ars_platform."SState"("IdeState")`,
  `CREATE INDEX IF NOT EXISTS "IX_SClaimApprovalThreshold_SProduct" ON ars_platform."SClaimApprovalThreshold" ("IdeProduct")`,
  `CREATE INDEX IF NOT EXISTS "IX_SClaimApprovalThreshold_SPlanProduct" ON ars_platform."SClaimApprovalThreshold" ("IdePlanProduct")`,
  `CREATE INDEX IF NOT EXISTS "IX_SClaimApprovalThreshold_SCoveragePlan" ON ars_platform."SClaimApprovalThreshold" ("IdeCoveragePlan")`,
  `CREATE INDEX IF NOT EXISTS "IX_SClaimApprovalThreshold_SCurrency" ON ars_platform."SClaimApprovalThreshold" ("IdeCurrency")`,
  `CREATE INDEX IF NOT EXISTS "IX_SClaimApprovalThreshold_TRol" ON ars_platform."SClaimApprovalThreshold" ("IdeRol")`,
  `CREATE INDEX IF NOT EXISTS "IX_SClaimApprovalThreshold_SState" ON ars_platform."SClaimApprovalThreshold" ("IdeState")`,

  // --- TClaimPayment -----------------------------------------------------
  `CREATE TABLE IF NOT EXISTS ars_platform."TClaimPayment" (
    "IdeClaimPayment" uuid NOT NULL DEFAULT gen_random_uuid(),
    "IdeApproval" uuid NOT NULL,
    "NumPayment" varchar(30) NOT NULL,
    "Amount" numeric NOT NULL,
    "TstPayment" timestamp NOT NULL,
    "NumExternalPayment" varchar,
    "DesObservation" varchar,
    "IdeState" uuid NOT NULL,
    "UsrCreation" varchar(60) NOT NULL,
    "TstCreation" timestamp NOT NULL,
    "UsrModification" varchar(60) NOT NULL,
    "TstModification" timestamp NOT NULL,
    CONSTRAINT "PK_TClaimPayment" PRIMARY KEY ("IdeClaimPayment"),
    CONSTRAINT "UK_TClaimPayment_01" UNIQUE ("NumPayment")
  )`,
  `ALTER TABLE ars_platform."TClaimPayment"
    ADD CONSTRAINT "FK_TClaimPayment_TApproval" FOREIGN KEY ("IdeApproval")
      REFERENCES ars_platform."TApproval"("IdeApproval")`,
  `ALTER TABLE ars_platform."TClaimPayment"
    ADD CONSTRAINT "FK_TClaimPayment_SState" FOREIGN KEY ("IdeState")
      REFERENCES ars_platform."SState"("IdeState")`,
  `CREATE INDEX IF NOT EXISTS "IX_TClaimPayment_TApproval" ON ars_platform."TClaimPayment" ("IdeApproval")`,
  `CREATE INDEX IF NOT EXISTS "IX_TClaimPayment_SState" ON ars_platform."TClaimPayment" ("IdeState")`,

  // --- Secuencias reales de Postgres para NumApproval/NumPayment (mismo
  //     criterio que SeqTClaimNumber/SeqTClaimFileNumber -- ver
  //     setup-claim-number-sequences.js). SeqTApprovalNumber se agregó
  //     el 2026-09-24 -- `TApproval.NumApproval` es NOT NULL UNIQUE y no
  //     existía ninguna secuencia legada para ella (Siniestros no trajo
  //     PL/pgSQL real, ver investigate-claims-engine.js). --
  `CREATE SEQUENCE IF NOT EXISTS ars_platform."SeqTApprovalNumber" START 1`,
  `CREATE SEQUENCE IF NOT EXISTS ars_platform."SeqTClaimPaymentNumber" START 1`,
];

async function constraintExists(client, constraintName) {
  const res = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [constraintName]);
  return res.rowCount > 0;
}

async function run(client, sql) {
  // Los ALTER TABLE ... ADD CONSTRAINT no soportan "IF NOT EXISTS" en
  // Postgres, así que se verifica manualmente para mantener el script
  // idempotente (se puede correr varias veces sin fallar).
  const addConstraintMatch = sql.match(/ADD CONSTRAINT "([^"]+)"/);
  if (addConstraintMatch) {
    const exists = await constraintExists(client, addConstraintMatch[1]);
    if (exists) {
      console.log(`OK (ya existía). Constraint "${addConstraintMatch[1]}".`);
      return;
    }
  }
  await client.query(sql);
  console.log(`OK. Ejecutado: ${sql.trim().slice(0, 80).replace(/\s+/g, ' ')}...`);
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  for (const sql of STATEMENTS) {
    await run(client, sql);
  }

  await client.end();
  console.log('\nMigración de Etapa 2 (Siniestros) completa.');
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
