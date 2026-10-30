#!/usr/bin/env node
/**
 * Prepara la BD para los riesgos con ficha de objeto asegurado (hoy: personas;
 * mas adelante vehiculos e inmuebles). Ver docs/02-roadmap.md. Idempotente.
 *
 *  - SRisk."CodInsuredObject" varchar(15) NULL: tipo de objeto asegurado del
 *    riesgo ('PERSON' hoy; 'VEHICLE' / 'PROPERTY' en el futuro; NULL = sin
 *    ficha propia). Con 'PERSON', al contratar la app pide los datos minimos
 *    de cada asegurado y crea/busca la persona. (SRiskType NO se usa: indica
 *    si el riesgo es principal u opcional.)
 *  - TQuoteRisk."ObjInsuredPerson" json: borrador del asegurado de ese riesgo en la cotizacion.
 *  - SRiskProduct."ObjInsuredPersonFields" json: configuracion, por riesgo de
 *    cada producto, de los datos de persona a pedir del asegurado
 *    ({ campo: "NONE" | "OPTIONAL" | "REQUIRED" }). Null = minimo por defecto
 *    (nombre, primer apellido, documento, nacimiento).
 *  - TPerson."DesEmail": se QUITA la restriccion UNIQUE (UK_TPerson_02) para
 *    permitir que varias personas compartan correo (menores con el correo de
 *    un padre). La identidad de la persona pasa a ser el documento
 *    (UK_TPerson_01: tipo + numero, que se mantiene). Se crea un indice normal.
 *  - Migra lo que hayan creado versiones anteriores de este script:
 *      SRisk."IndPersonRisk" (boolean)            -> CodInsuredObject = 'PERSON'
 *      SRiskType."IndPersonRisk" (boolean)        -> CodInsuredObject = 'PERSON' en los SRisk que usan ese tipo
 *      SProduct."ObjInsuredPersonFields" (json)   -> SRiskProduct de los riesgos persona
 *    y elimina esas columnas.
 *  - Marca como persona los riesgos cuyo codigo/descripcion sea "PERSONA"/"PERSON"
 *    (si existen); el resto se marca desde Catalogos > Riesgos.
 *
 * Uso (desde la raiz del repo):
 *   bash scripts/db-run.sh setup-person-risks.js
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

async function columnExists(client, table, column) {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'ars_platform' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return res.rowCount > 0;
}

async function main() {
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const statements = [
    `ALTER TABLE ars_platform."SRisk" ADD COLUMN IF NOT EXISTS "CodInsuredObject" varchar(15)`,
    `ALTER TABLE ars_platform."SRiskProduct" ADD COLUMN IF NOT EXISTS "ObjInsuredPersonFields" json`,
    // Borrador de los datos del asegurado de un riesgo de la cotizacion (se recupera al retomarla).
    `ALTER TABLE ars_platform."TQuoteRisk" ADD COLUMN IF NOT EXISTS "ObjInsuredPerson" json`,
    `ALTER TABLE ars_platform."TPerson" DROP CONSTRAINT IF EXISTS "UK_TPerson_02"`,
    `DROP INDEX IF EXISTS ars_platform."UK_TPerson_02"`,
    `CREATE INDEX IF NOT EXISTS "IX_TPerson_DesEmail" ON ars_platform."TPerson" ("DesEmail")`,
  ];
  for (const sql of statements) await client.query(sql);

  // Version anterior 1: la marca booleana estaba en SRiskType (error de diseno).
  if (await columnExists(client, 'SRiskType', 'IndPersonRisk')) {
    const moved = await client.query(
      `UPDATE ars_platform."SRisk" r SET "CodInsuredObject" = 'PERSON'
        WHERE EXISTS (
          SELECT 1 FROM ars_platform."SRiskProduct" rp
            JOIN ars_platform."SRiskType" rt ON rt."IdeRiskType" = rp."IdeRiskType"
           WHERE rp."IdeRisk" = r."IdeRisk" AND rt."IndPersonRisk" = true)
        RETURNING r."CodRisk"`,
    );
    console.log('Marca traspasada de SRiskType a SRisk:', JSON.stringify(moved.rows.map((r) => r.CodRisk)));
    await client.query(`ALTER TABLE ars_platform."SRiskType" DROP COLUMN "IndPersonRisk"`);
  }

  // Version anterior 2: la marca booleana estaba en SRisk.
  if (await columnExists(client, 'SRisk', 'IndPersonRisk')) {
    const moved = await client.query(
      `UPDATE ars_platform."SRisk" SET "CodInsuredObject" = 'PERSON'
        WHERE "IndPersonRisk" = true RETURNING "CodRisk"`,
    );
    console.log('Marca booleana de SRisk convertida a CodInsuredObject=PERSON:', JSON.stringify(moved.rows.map((r) => r.CodRisk)));
    await client.query(`ALTER TABLE ars_platform."SRisk" DROP COLUMN "IndPersonRisk"`);
  }

  const marked = await client.query(
    `UPDATE ars_platform."SRisk" SET "CodInsuredObject" = 'PERSON'
      WHERE "CodInsuredObject" IS NULL
        AND (upper("CodRisk") IN ('PERSONA','PERSON') OR upper("DesRisk") IN ('PERSONA','PERSON'))
      RETURNING "CodRisk", "DesRisk"`,
  );

  // Version anterior: la configuracion de persona se guardaba en SProduct (a nivel de producto).
  if (await columnExists(client, 'SProduct', 'ObjInsuredPersonFields')) {
    const copied = await client.query(
      `UPDATE ars_platform."SRiskProduct" rp SET "ObjInsuredPersonFields" = p."ObjInsuredPersonFields"
         FROM ars_platform."SProduct" p, ars_platform."SRisk" r
        WHERE p."IdeProduct" = rp."IdeProduct" AND r."IdeRisk" = rp."IdeRisk" AND r."CodInsuredObject" = 'PERSON'
          AND rp."ObjInsuredPersonFields" IS NULL AND p."ObjInsuredPersonFields" IS NOT NULL
        RETURNING rp."CodRiskProduct"`,
    );
    console.log('Configuracion de persona traspasada de SProduct a SRiskProduct:', JSON.stringify(copied.rows.map((r) => r.CodRiskProduct)));
    await client.query(`ALTER TABLE ars_platform."SProduct" DROP COLUMN "ObjInsuredPersonFields"`);
  }

  const all = await client.query(
    `SELECT "CodRisk", "DesRisk", "CodInsuredObject" FROM ars_platform."SRisk" ORDER BY 1`,
  );
  console.log('OK. Columnas listas; correo de TPerson ya no es unico.');
  console.log('Marcados como persona por nombre:', JSON.stringify(marked.rows));
  console.log('Riesgos:', JSON.stringify(all.rows));
  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
